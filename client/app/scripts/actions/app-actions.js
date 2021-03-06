import debug from 'debug';
import { find } from 'lodash';
import { fromJS } from 'immutable';

import ActionTypes from '../constants/action-types';
import { saveGraph } from '../utils/file-utils';
import { updateRoute } from '../utils/router-utils';
import {
  doControlRequest,
  getAllNodes,
  getResourceViewNodesSnapshot,
  getNodeDetails,
  getTopologies,
  deletePipe,
  stopPolling,
  teardownWebsockets,
  getNodes,
} from '../utils/web-api-utils';
import { storageSet } from '../utils/storage-utils';
import { loadTheme } from '../utils/contrast-utils';
import { isPausedSelector } from '../selectors/time-travel';
import {
  availableMetricTypesSelector,
  nextPinnedMetricTypeSelector,
  previousPinnedMetricTypeSelector,
  pinnedMetricSelector,
} from '../selectors/node-metric';
import {
  isResourceViewModeSelector,
  resourceViewAvailableSelector,
} from '../selectors/topology';

import {
  GRAPH_VIEW_MODE,
  TABLE_VIEW_MODE,
  RESOURCE_VIEW_MODE,
} from '../constants/naming';


const log = debug('scope:app-actions');


export function showHelp() {
  return { type: ActionTypes.SHOW_HELP };
}


export function hideHelp() {
  return { type: ActionTypes.HIDE_HELP };
}


export function toggleHelp() {
  return (dispatch, getState) => {
    if (getState().get('showingHelp')) {
      dispatch(hideHelp());
    } else {
      dispatch(showHelp());
    }
  };
}


export function sortOrderChanged(sortedBy, sortedDesc) {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.SORT_ORDER_CHANGED,
      sortedBy,
      sortedDesc
    });
    updateRoute(getState);
  };
}


//
// Networks
//


export function showNetworks(visible) {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.SHOW_NETWORKS,
      visible
    });

    updateRoute(getState);
  };
}


export function selectNetwork(networkId) {
  return {
    type: ActionTypes.SELECT_NETWORK,
    networkId
  };
}

export function pinNetwork(networkId) {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.PIN_NETWORK,
      networkId,
    });

    updateRoute(getState);
  };
}

export function unpinNetwork(networkId) {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.UNPIN_NETWORK,
      networkId,
    });

    updateRoute(getState);
  };
}


//
// Metrics
//

export function hoverMetric(metricType) {
  return {
    type: ActionTypes.HOVER_METRIC,
    metricType,
  };
}

export function unhoverMetric() {
  return {
    type: ActionTypes.UNHOVER_METRIC,
  };
}

export function pinMetric(metricType) {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.PIN_METRIC,
      metricType,
    });
    updateRoute(getState);
  };
}

export function unpinMetric() {
  return (dispatch, getState) => {
    // We always have to keep metrics pinned in the resource view.
    if (!isResourceViewModeSelector(getState())) {
      dispatch({
        type: ActionTypes.UNPIN_METRIC,
      });
      updateRoute(getState);
    }
  };
}

export function pinNextMetric() {
  return (dispatch, getState) => {
    const nextPinnedMetricType = nextPinnedMetricTypeSelector(getState());
    dispatch(pinMetric(nextPinnedMetricType));
  };
}

export function pinPreviousMetric() {
  return (dispatch, getState) => {
    const previousPinnedMetricType = previousPinnedMetricTypeSelector(getState());
    dispatch(pinMetric(previousPinnedMetricType));
  };
}

export function pinSearch() {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.PIN_SEARCH,
      query: getState().get('searchQuery'),
    });
    updateRoute(getState);
  };
}

export function unpinSearch(query) {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.UNPIN_SEARCH,
      query
    });
    updateRoute(getState);
  };
}

export function blurSearch() {
  return { type: ActionTypes.BLUR_SEARCH };
}

export function changeTopologyOption(option, value, topologyId, addOrRemove) {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.CHANGE_TOPOLOGY_OPTION,
      topologyId,
      option,
      value,
      addOrRemove
    });
    updateRoute(getState);
    // update all request workers with new options
    getTopologies(getState, dispatch);
    getNodes(getState, dispatch);
  };
}

export function clickBackground() {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.CLICK_BACKGROUND
    });
    updateRoute(getState);
  };
}

export function clickCloseDetails(nodeId) {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.CLICK_CLOSE_DETAILS,
      nodeId
    });
    // Pull the most recent details for the next details panel that comes into focus.
    getNodeDetails(getState, dispatch);
    updateRoute(getState);
  };
}

export function clickCloseTerminal(pipeId, closePipe) {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.CLICK_CLOSE_TERMINAL,
      pipeId
    });
    if (closePipe) {
      deletePipe(pipeId, dispatch);
    }
    updateRoute(getState);
  };
}

export function clickDownloadGraph() {
  return (dispatch) => {
    dispatch({ type: ActionTypes.SET_EXPORTING_GRAPH, exporting: true });
    saveGraph();
    dispatch({ type: ActionTypes.SET_EXPORTING_GRAPH, exporting: false });
  };
}

export function clickForceRelayout() {
  return (dispatch) => {
    dispatch({
      type: ActionTypes.CLICK_FORCE_RELAYOUT,
      forceRelayout: true
    });
    // fire only once, reset after dispatch
    setTimeout(() => {
      dispatch({
        type: ActionTypes.CLICK_FORCE_RELAYOUT,
        forceRelayout: false
      });
    }, 100);
  };
}

export function doSearch(searchQuery) {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.DO_SEARCH,
      searchQuery
    });
    updateRoute(getState);
  };
}

export function setViewportDimensions(width, height) {
  return (dispatch) => {
    dispatch({ type: ActionTypes.SET_VIEWPORT_DIMENSIONS, width, height });
  };
}

export function setGraphView() {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.SET_VIEW_MODE,
      viewMode: GRAPH_VIEW_MODE,
    });
    updateRoute(getState);
  };
}

export function setTableView() {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.SET_VIEW_MODE,
      viewMode: TABLE_VIEW_MODE,
    });
    updateRoute(getState);
  };
}

export function setResourceView() {
  return (dispatch, getState) => {
    if (resourceViewAvailableSelector(getState())) {
      dispatch({
        type: ActionTypes.SET_VIEW_MODE,
        viewMode: RESOURCE_VIEW_MODE,
      });
      // Pin the first metric if none of the visible ones is pinned.
      const state = getState();
      if (!pinnedMetricSelector(state)) {
        const firstAvailableMetricType = availableMetricTypesSelector(state).first();
        dispatch(pinMetric(firstAvailableMetricType));
      }
      getResourceViewNodesSnapshot(getState(), dispatch);
      updateRoute(getState);
    }
  };
}

export function clickNode(nodeId, label, origin, topologyId = null) {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.CLICK_NODE,
      origin,
      label,
      nodeId,
      topologyId,
    });
    updateRoute(getState);
    getNodeDetails(getState, dispatch);
  };
}

export function pauseTimeAtNow() {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.PAUSE_TIME_AT_NOW
    });
    updateRoute(getState);
    if (!getState().get('nodesLoaded')) {
      getNodes(getState, dispatch);
      if (isResourceViewModeSelector(getState())) {
        getResourceViewNodesSnapshot(getState(), dispatch);
      }
    }
  };
}

export function clickRelative(nodeId, topologyId, label, origin) {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.CLICK_RELATIVE,
      label,
      origin,
      nodeId,
      topologyId
    });
    updateRoute(getState);
    getNodeDetails(getState, dispatch);
  };
}

function updateTopology(dispatch, getState) {
  const state = getState();
  // If we're in the resource view, get the snapshot of all the relevant node topologies.
  if (isResourceViewModeSelector(state)) {
    getResourceViewNodesSnapshot(state, dispatch);
  }
  updateRoute(getState);
  // NOTE: This is currently not needed for our static resource
  // view, but we'll need it here later and it's simpler to just
  // keep it than to redo the nodes delta updating logic.
  getNodes(getState, dispatch);
}

export function clickShowTopologyForNode(topologyId, nodeId) {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.CLICK_SHOW_TOPOLOGY_FOR_NODE,
      topologyId,
      nodeId
    });
    updateTopology(dispatch, getState);
  };
}

export function clickTopology(topologyId) {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.CLICK_TOPOLOGY,
      topologyId
    });
    updateTopology(dispatch, getState);
  };
}

export function cacheZoomState(zoomState) {
  return {
    type: ActionTypes.CACHE_ZOOM_STATE,
    // Make sure only proper numerical values are cached.
    zoomState: zoomState.filter(value => !window.isNaN(value)),
  };
}

export function openWebsocket() {
  return {
    type: ActionTypes.OPEN_WEBSOCKET
  };
}

export function clearControlError(nodeId) {
  return {
    type: ActionTypes.CLEAR_CONTROL_ERROR,
    nodeId
  };
}

export function closeWebsocket() {
  return {
    type: ActionTypes.CLOSE_WEBSOCKET
  };
}

export function doControl(nodeId, control) {
  return (dispatch) => {
    dispatch({
      type: ActionTypes.DO_CONTROL,
      nodeId,
      control
    });
    doControlRequest(nodeId, control, dispatch);
  };
}

export function enterEdge(edgeId) {
  return {
    type: ActionTypes.ENTER_EDGE,
    edgeId
  };
}

export function enterNode(nodeId) {
  return {
    type: ActionTypes.ENTER_NODE,
    nodeId
  };
}

export function focusSearch() {
  return (dispatch, getState) => {
    dispatch({ type: ActionTypes.FOCUS_SEARCH });
    // update nodes cache to allow search across all topologies,
    // wait a second until animation is over
    // NOTE: This will cause matching recalculation (and rerendering)
    // of all the nodes in the topology, instead applying it only on
    // the nodes delta. The solution would be to implement deeper
    // search selectors with per-node caching instead of per-topology.
    setTimeout(() => {
      getAllNodes(getState(), dispatch);
    }, 1200);
  };
}

export function hitBackspace() {
  return (dispatch, getState) => {
    const state = getState();
    // remove last pinned query if search query is empty
    if (state.get('searchFocused') && !state.get('searchQuery')) {
      const query = state.get('pinnedSearches').last();
      if (query) {
        dispatch({
          type: ActionTypes.UNPIN_SEARCH,
          query
        });
        updateRoute(getState);
      }
    }
  };
}

export function hitEsc() {
  return (dispatch, getState) => {
    const state = getState();
    const controlPipe = state.get('controlPipes').last();
    if (controlPipe && controlPipe.get('status') === 'PIPE_DELETED') {
      dispatch({
        type: ActionTypes.CLICK_CLOSE_TERMINAL,
        pipeId: controlPipe.get('id')
      });
      updateRoute(getState);
      // Don't deselect node on ESC if there is a controlPipe (keep terminal open)
    } else if (state.get('searchFocused')) {
      if (state.get('searchQuery')) {
        dispatch(doSearch(''));
      } else {
        dispatch(blurSearch());
      }
    } else if (state.get('showingHelp')) {
      dispatch(hideHelp());
    } else if (state.get('nodeDetails').last() && !controlPipe) {
      dispatch({ type: ActionTypes.DESELECT_NODE });
      updateRoute(getState);
    }
  };
}

export function leaveEdge(edgeId) {
  return {
    type: ActionTypes.LEAVE_EDGE,
    edgeId
  };
}

export function leaveNode(nodeId) {
  return {
    type: ActionTypes.LEAVE_NODE,
    nodeId
  };
}

export function receiveControlError(nodeId, err) {
  return {
    type: ActionTypes.DO_CONTROL_ERROR,
    nodeId,
    error: err
  };
}

export function receiveControlSuccess(nodeId) {
  return {
    type: ActionTypes.DO_CONTROL_SUCCESS,
    nodeId
  };
}

export function receiveNodeDetails(details, requestTimestamp) {
  return {
    type: ActionTypes.RECEIVE_NODE_DETAILS,
    requestTimestamp,
    details
  };
}

export function receiveNodesDelta(delta) {
  return (dispatch, getState) => {
    if (!isPausedSelector(getState())) {
      // Allow css-animation to run smoothly by scheduling it to run on the
      // next tick after any potentially expensive canvas re-draws have been
      // completed.
      setTimeout(() => dispatch({ type: ActionTypes.SET_RECEIVED_NODES_DELTA }), 0);

      // When moving in time, we will consider the transition complete
      // only when the first batch of nodes delta has been received. We
      // do that because we want to keep the previous state blurred instead
      // of transitioning over an empty state like when switching topologies.
      if (getState().get('timeTravelTransitioning')) {
        dispatch({ type: ActionTypes.FINISH_TIME_TRAVEL_TRANSITION });
      }

      const hasChanges = delta.add || delta.update || delta.remove || delta.reset;
      if (hasChanges) {
        dispatch({
          type: ActionTypes.RECEIVE_NODES_DELTA,
          delta
        });
      }
    }
  };
}

export function resumeTime() {
  return (dispatch, getState) => {
    if (isPausedSelector(getState())) {
      dispatch({
        type: ActionTypes.RESUME_TIME
      });
      updateRoute(getState);
      // After unpausing, all of the following calls will re-activate polling.
      getTopologies(getState, dispatch);
      getNodes(getState, dispatch, true);
      if (isResourceViewModeSelector(getState())) {
        getResourceViewNodesSnapshot(getState(), dispatch);
      }
    }
  };
}

export function startTimeTravel(timestamp = null) {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.START_TIME_TRAVEL,
      timestamp,
    });
    updateRoute(getState);
    if (!getState().get('nodesLoaded')) {
      getNodes(getState, dispatch);
      if (isResourceViewModeSelector(getState())) {
        getResourceViewNodesSnapshot(getState(), dispatch);
      }
    } else {
      // Get most recent details before freezing the state.
      getNodeDetails(getState, dispatch);
    }
  };
}

export function receiveNodes(nodes) {
  return {
    type: ActionTypes.RECEIVE_NODES,
    nodes,
  };
}

export function jumpToTime(timestamp) {
  return (dispatch, getState) => {
    const getScopeState = () => getState().scope || getState();
    dispatch({
      type: ActionTypes.JUMP_TO_TIME,
      timestamp,
    });
    updateRoute(getScopeState);
    getNodes(getScopeState, dispatch);
    getTopologies(getScopeState, dispatch);
    if (isResourceViewModeSelector(getScopeState())) {
      getResourceViewNodesSnapshot(getScopeState(), dispatch);
    }
  };
}

export function receiveNodesForTopology(nodes, topologyId) {
  return {
    type: ActionTypes.RECEIVE_NODES_FOR_TOPOLOGY,
    nodes,
    topologyId
  };
}

export function receiveTopologies(topologies) {
  return (dispatch, getState) => {
    const getScopeState = () => getState().scope || getState();
    const firstLoad = !getScopeState().get('topologiesLoaded');
    dispatch({
      type: ActionTypes.RECEIVE_TOPOLOGIES,
      topologies
    });
    getNodes(getScopeState, dispatch);
    // Populate search matches on first load
    const state = getScopeState();
    if (firstLoad && state.get('searchQuery')) {
      dispatch(focusSearch());
    }
    // Fetch all the relevant nodes once on first load
    if (firstLoad && isResourceViewModeSelector(state)) {
      getResourceViewNodesSnapshot(state, dispatch);
    }
  };
}

export function receiveApiDetails(apiDetails) {
  return (dispatch, getState) => {
    const isFirstTime = !getState().get('version');
    const pausedAt = getState().get('pausedAt');

    dispatch({
      type: ActionTypes.RECEIVE_API_DETAILS,
      capabilities: fromJS(apiDetails.capabilities || {}),
      hostname: apiDetails.hostname,
      version: apiDetails.version,
      newVersion: apiDetails.newVersion,
      plugins: apiDetails.plugins,
    });

    // On initial load either start time travelling at the pausedAt timestamp
    // (if it was given as URL param) if time travelling is enabled, otherwise
    // simply pause at the present time which is arguably the next best thing
    // we could do.
    // NOTE: We can't make this decision before API details are received because
    // we have no prior info on whether time travel would be available.
    if (isFirstTime && pausedAt) {
      if (apiDetails.capabilities && apiDetails.capabilities.historic_reports) {
        dispatch(startTimeTravel(pausedAt));
      } else {
        dispatch(pauseTimeAtNow());
      }
    }
  };
}

export function receiveControlNodeRemoved(nodeId) {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.RECEIVE_CONTROL_NODE_REMOVED,
      nodeId
    });
    updateRoute(getState);
  };
}

export function receiveControlPipeFromParams(pipeId, rawTty, resizeTtyControl) {
  // TODO add nodeId
  return {
    type: ActionTypes.RECEIVE_CONTROL_PIPE,
    pipeId,
    rawTty,
    resizeTtyControl
  };
}

export function receiveControlPipe(pipeId, nodeId, rawTty, resizeTtyControl, control) {
  return (dispatch, getState) => {
    const state = getState();
    if (state.get('nodeDetails').last()
      && nodeId !== state.get('nodeDetails').last().id) {
      log('Node was deselected before we could set up control!');
      deletePipe(pipeId, dispatch);
      return;
    }

    const controlPipe = state.get('controlPipes').last();
    if (controlPipe && controlPipe.get('id') !== pipeId) {
      deletePipe(controlPipe.get('id'), dispatch);
    }

    dispatch({
      type: ActionTypes.RECEIVE_CONTROL_PIPE,
      nodeId,
      pipeId,
      rawTty,
      resizeTtyControl,
      control
    });

    updateRoute(getState);
  };
}

export function receiveControlPipeStatus(pipeId, status) {
  return {
    type: ActionTypes.RECEIVE_CONTROL_PIPE_STATUS,
    pipeId,
    status
  };
}

export function receiveError(errorUrl) {
  return {
    errorUrl,
    type: ActionTypes.RECEIVE_ERROR
  };
}

export function receiveNotFound(nodeId, requestTimestamp) {
  return {
    type: ActionTypes.RECEIVE_NOT_FOUND,
    requestTimestamp,
    nodeId,
  };
}

export function setContrastMode(enabled) {
  return (dispatch) => {
    loadTheme(enabled ? 'contrast' : 'normal');
    dispatch({
      type: ActionTypes.TOGGLE_CONTRAST_MODE,
      enabled,
    });
  };
}

export function getTopologiesWithInitialPoll() {
  return (dispatch, getState) => {
    getTopologies(getState, dispatch, true);
  };
}

export function route(urlState) {
  return (dispatch, getState) => {
    dispatch({
      state: urlState,
      type: ActionTypes.ROUTE_TOPOLOGY
    });
    // Handle Time Travel state update through separate actions as it's more complex.
    // This is mostly to handle switching contexts Explore <-> Monitor in WC while
    // the timestamp keeps changing - e.g. if we were Time Travelling in Scope and
    // then went live in Monitor, switching back to Explore should properly close
    // the Time Travel etc, not just update the pausedAt state directly.
    if (!urlState.pausedAt) {
      dispatch(resumeTime());
    } else {
      dispatch(startTimeTravel(urlState.pausedAt));
    }
    // update all request workers with new options
    getTopologies(getState, dispatch);
    getNodes(getState, dispatch);
    // If we are landing on the resource view page, we need to fetch not only all the
    // nodes for the current topology, but also the nodes of all the topologies that make
    // the layers in the resource view.
    const state = getState();
    if (isResourceViewModeSelector(state)) {
      getResourceViewNodesSnapshot(state, dispatch);
    }
  };
}

export function resetLocalViewState() {
  return (dispatch) => {
    dispatch({type: ActionTypes.RESET_LOCAL_VIEW_STATE});
    storageSet('scopeViewState', '');
    // eslint-disable-next-line prefer-destructuring
    window.location.href = window.location.href.split('#')[0];
  };
}

export function toggleTroubleshootingMenu(ev) {
  if (ev) { ev.preventDefault(); ev.stopPropagation(); }
  return {
    type: ActionTypes.TOGGLE_TROUBLESHOOTING_MENU
  };
}

export function changeInstance() {
  return (dispatch, getState) => {
    dispatch({
      type: ActionTypes.CHANGE_INSTANCE
    });
    updateRoute(getState);
  };
}

export function shutdown() {
  return (dispatch) => {
    stopPolling();
    teardownWebsockets();
    dispatch({
      type: ActionTypes.SHUTDOWN
    });
  };
}

export function getImagesForService(orgId, serviceId) {
  return (dispatch, getState, { api }) => {
    dispatch({
      type: ActionTypes.REQUEST_SERVICE_IMAGES,
      serviceId
    });

    // Use the fluxv2 api
    api.getFluxImages(orgId, serviceId, 2)
      .then((services) => {
        dispatch({
          type: ActionTypes.RECEIVE_SERVICE_IMAGES,
          service: find(services, s => s.ID === serviceId),
          serviceId
        });
      }, ({ errors }) => {
        dispatch({
          type: ActionTypes.RECEIVE_SERVICE_IMAGES,
          errors
        });
      });
  };
}
