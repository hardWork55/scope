package procspy

// /proc-based implementation.

import (
	"bytes"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	log "github.com/Sirupsen/logrus"
	"github.com/armon/go-metrics"
	"github.com/hashicorp/go-version"

	"github.com/weaveworks/scope/common/fs"
	"github.com/weaveworks/scope/common/marshal"
	"github.com/weaveworks/scope/probe/process"
)

var (
	procRoot               = "/proc"
	namespaceKey           = []string{"procspy", "namespaces"}
	netNamespacePathSuffix = ""
)

// SetProcRoot sets the location of the proc filesystem.
func SetProcRoot(root string) {
	procRoot = root
}

func getKernelVersion() (*version.Version, error) {
	var u syscall.Utsname
	if err := syscall.Uname(&u); err != nil {
		return nil, err
	}

	release := marshal.FromUtsname(u.Release)
	return version.NewVersion(release)
}

func getNetNamespacePathSuffix() string {
	// With Linux 3.8 or later the network namespace of a process can be
	// determined by the inode of /proc/PID/net/ns.  Before that, Any file
	// under /proc/PID/net/ could be used but it's not documented and may
	// break in newer kernels.
	const (
		post38Path = "ns/net"
		pre38Path  = "net/dev"
	)

	if netNamespacePathSuffix != "" {
		return netNamespacePathSuffix
	}

	v, err := getKernelVersion()
	if err != nil {
		log.Errorf("getNeNameSpacePath: cannot get kernel version: %s\n", err)
		netNamespacePathSuffix = post38Path
		return netNamespacePathSuffix
	}

	v38, _ := version.NewVersion("3.8")
	if v.LessThan(v38) {
		netNamespacePathSuffix = pre38Path
	} else {
		netNamespacePathSuffix = post38Path
	}
	return netNamespacePathSuffix
}

// Read the connections for a group of processes living in the same namespace,
// which are found (identically) in /proc/PID/net/tcp{,6} for any of the
// processes.
func readProcessConnections(buf *bytes.Buffer, namespaceProcs []*process.Process) (bool, error) {
	var (
		errRead  error
		errRead6 error
		read     int64
		read6    int64
	)

	for _, p := range namespaceProcs {
		dirName := strconv.Itoa(p.PID)

		read, errRead = readFile(filepath.Join(procRoot, dirName, "/net/tcp"), buf)
		read6, errRead6 = readFile(filepath.Join(procRoot, dirName, "/net/tcp6"), buf)

		if errRead != nil || errRead6 != nil {
			// try next process
			continue
		}
		return read+read6 > 0, nil
	}

	// would be cool to have an or operation between errors
	if errRead != nil {
		return false, errRead
	}
	if errRead6 != nil {
		return false, errRead6
	}

	return false, nil

}

// walkNamespacePid does the work of walkProcPid for a single namespace
func walkNamespacePid(buf *bytes.Buffer, sockets map[uint64]*Proc, namespaceProcs []*process.Process, ticker <-chan time.Time, fdBlockSize int) error {

	if found, err := readProcessConnections(buf, namespaceProcs); err != nil || !found {
		return err
	}

	var statT syscall.Stat_t
	var fdBlockCount int
	for i, p := range namespaceProcs {

		// Get the sockets for all the processes in the namespace
		dirName := strconv.Itoa(p.PID)
		fdBase := filepath.Join(procRoot, dirName, "fd")

		if fdBlockCount > fdBlockSize {
			// we surpassed the filedescriptor rate limit
			<-ticker
			fdBlockCount = 0

			// read the connections again to
			// avoid the race between between /net/tcp{,6} and /proc/PID/fd/*
			if found, err := readProcessConnections(buf, namespaceProcs[i:]); err != nil || !found {
				return err
			}
		}

		fds, err := fs.ReadDirNames(fdBase)
		if err != nil {
			// Process is gone by now, or we don't have access.
			continue
		}

		var proc *Proc
		for _, fd := range fds {
			fdBlockCount++

			// Direct use of syscall.Stat() to save garbage.
			err = fs.Stat(filepath.Join(fdBase, fd), &statT)
			if err != nil {
				continue
			}

			// We want sockets only.
			if statT.Mode&syscall.S_IFMT != syscall.S_IFSOCK {
				continue
			}

			// Initialize proc lazily to avoid creating unnecessary
			// garbage
			if proc == nil {
				proc = &Proc{
					PID:  uint(p.PID),
					Name: p.Name,
				}
			}

			sockets[statT.Ino] = proc
		}

	}

	return nil
}

// walkProcPid walks over all numerical (PID) /proc entries. It reads
// /proc/PID/net/tcp{,6} for each namespace and sees if the ./fd/* files of each
// process in that namespace are symlinks to sockets. Returns a map from socket
// ID (inode) to PID.
func walkProcPid(buf *bytes.Buffer, walker process.Walker, ticker <-chan time.Time, fdBlockSize int) (map[uint64]*Proc, error) {
	var (
		sockets    = map[uint64]*Proc{}              // map socket inode -> process
		namespaces = map[uint64][]*process.Process{} // map network namespace id -> processes
		statT      syscall.Stat_t
	)

	// We do two process traversals: One to group processes by namespace and
	// another one to obtain their connections.
	//
	// The first traversal is needed to allow obtaining the connections on a
	// per-namespace basis. This is done to minimize the race condition
	// between reading /net/tcp{,6} of each namespace and /proc/PID/fd/* for
	// the processes living in that namespace.

	walker.Walk(func(p, _ process.Process) {
		dirName := strconv.Itoa(p.PID)

		netNamespacePath := filepath.Join(procRoot, dirName, getNetNamespacePathSuffix())
		if err := fs.Stat(netNamespacePath, &statT); err != nil {
			return
		}

		namespaceID := statT.Ino
		namespaces[namespaceID] = append(namespaces[namespaceID], &p)
	})

	for _, procs := range namespaces {
		<-ticker
		walkNamespacePid(buf, sockets, procs, ticker, fdBlockSize)
	}

	metrics.SetGauge(namespaceKey, float32(len(namespaces)))
	return sockets, nil
}

// readFile reads an arbitrary file into a buffer. It's a variable so it can
// be overwritten for benchmarks. That's bad practice and we should change it
// to be a dependency.
var readFile = func(filename string, buf *bytes.Buffer) (int64, error) {
	f, err := fs.Open(filename)
	if err != nil {
		return -1, err
	}
	defer f.Close()
	return buf.ReadFrom(f)
}
