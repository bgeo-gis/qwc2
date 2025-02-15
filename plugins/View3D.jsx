/**
 * Copyright 2024 Sourcepole AG
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import {connect, Provider} from 'react-redux';

import PropTypes from 'prop-types';
import {createSelector} from 'reselect';

import * as displayExports from '../actions/display';
import {setView3dMode, View3DMode} from '../actions/display';
import {setCurrentTask} from '../actions/task';
import PluginsContainer from '../components/PluginsContainer';
import ResizeableWindow from '../components/ResizeableWindow';
import StandardApp from '../components/StandardApp';
import View3DSwitcher from '../components/map3d/View3DSwitcher';
import ReducerIndex from '../reducers/index';
import searchProvidersSelector from '../selectors/searchproviders';
import {createStore} from '../stores/StandardStore';
import LocaleUtils from '../utils/LocaleUtils';


/**
 * Displays a 3D map view.
 */
class View3D extends React.Component {
    static propTypes = {
        /** The position slot index of the 3d switch map button, from the bottom (0: bottom slot). */
        buttonPosition: PropTypes.number,
        display: PropTypes.object,
        enabled: PropTypes.bool,
        /** Default window geometry. */
        geometry: PropTypes.shape({
            initialWidth: PropTypes.number,
            initialHeight: PropTypes.number,
            initialX: PropTypes.number,
            initialY: PropTypes.number,
            initiallyDocked: PropTypes.bool
        }),
        layers: PropTypes.object,
        localConfig: PropTypes.object,
        mapBBox: PropTypes.object,
        /** Various configuration options */
        options: PropTypes.shape({
            /** Minimum scale denominator when zooming to search result. */
            searchMinScaleDenom: PropTypes.number
        }),
        plugins: PropTypes.object,
        pluginsConfig: PropTypes.object,
        projection: PropTypes.string,
        searchProviders: PropTypes.object,
        setCurrentTask: PropTypes.func,
        setView3dMode: PropTypes.func,
        startupParams: PropTypes.object,
        theme: PropTypes.object,
        view3dMode: PropTypes.number
    };
    static defaultProps = {
        buttonPosition: 6,
        geometry: {
            initialWidth: 600,
            initialHeight: 800,
            initialX: 0,
            initialY: 0,
            initiallyDocked: true
        },
        options: {
            searchMinScaleDenom: 1000
        }
    };
    state = {
        componentLoaded: false
    };
    constructor(props) {
        super(props);
        this.map3dComponent = null;
        this.map3dComponentRef = null;
        // Subset of 2d reducers
        const {
            task,
            windows
        } = ReducerIndex.reducers;
        // Inline reducers to sync parts of parent store
        const displayActions = Object.values(displayExports).filter(x => typeof(x) === 'string');
        const display = (state = {}, action) => {
            if (displayActions.includes(action.type)) {
                // Forward to parent store
                StandardApp.store.dispatch(action);
                return state;
            } else {
                return action.type === "SYNC_DISPLAY_FROM_PARENT_STORE" ? action.display : state;
            }
        };
        const localConfig = (state = {}, action) => {
            return action.type === "SYNC_LOCAL_CONFIG_FROM_PARENT_STORE" ? action.localConfig : state;
        };
        const theme = (state = {}, action) => {
            return action.type === "SYNC_THEME_FROM_PARENT_STORE" ? action.theme : state;
        };
        const layers = (state = {}, action) => {
            return action.type === "SYNC_LAYERS_FROM_PARENT_STORE" ? action.layers : state;
        };
        this.store = createStore({task, windows, display, localConfig, theme, layers});
    }
    componentDidMount() {
        if (this.props.startupParams.v === "3d") {
            this.props.setView3dMode(View3DMode.FULLSCREEN);
        } else if (this.props.startupParams.v === "3d2d") {
            this.props.setView3dMode(View3DMode.SPLITSCREEN);
        }
    }
    componentDidUpdate(prevProps, prevState) {
        if (this.props.enabled && !prevProps.enabled) {
            this.setState({mode: View3DMode.FULLSCREEN});
            this.props.setCurrentTask(null);
        } else if (this.props.display.view3dMode !== View3DMode.DISABLED && prevProps.display.view3dMode === View3DMode.DISABLED) {
            import('../components/map3d/Map3D').then(component => {
                this.map3dComponent = component.default;
                this.map3dComponentRef = null;
                this.setState({componentLoaded: true});
            });
        } else if (this.props.display.view3dMode === View3DMode.DISABLED && prevProps.display.view3dMode !== View3DMode.DISABLED) {
            this.map3dComponent = null;
            this.map3dComponentRef = null;
            this.setState({componentLoaded: false});
        }
        // Sync parts of parent store
        if (this.props.display !== prevProps.display) {
            this.store.dispatch({type: "SYNC_DISPLAY_FROM_PARENT_STORE", display: this.props.display});
        }
        if (this.props.theme !== prevProps.theme) {
            this.store.dispatch({type: "SYNC_THEME_FROM_PARENT_STORE", theme: this.props.theme});
        }
        if (this.props.localConfig !== prevProps.localConfig) {
            this.store.dispatch({type: "SYNC_LOCAL_CONFIG_FROM_PARENT_STORE", localConfig: this.props.localConfig});
        }
        if (this.props.layers !== prevProps.layers) {
            this.store.dispatch({type: "SYNC_LAYERS_FROM_PARENT_STORE", layers: this.props.layers});
        }
    }
    render3DWindow = () => {
        if (this.props.display.view3dMode > View3DMode.DISABLED) {
            const extraControls = [{
                icon: "sync",
                callback: this.setViewToExtent,
                title: LocaleUtils.tr("map3d.syncview")
            }, {
                icon: "maximize",
                callback: () => this.props.setView3dMode(View3DMode.FULLSCREEN),
                title: LocaleUtils.tr("window.maximize")
            }];
            const Map3D = this.map3dComponent;
            return (
                <ResizeableWindow
                    extraControls={extraControls}
                    fullscreen={this.props.display.view3dMode === View3DMode.FULLSCREEN}
                    icon="map3d"
                    initialHeight={this.props.geometry.initialHeight}
                    initialWidth={this.props.geometry.initialWidth}
                    initialX={this.props.geometry.initialX}
                    initialY={this.props.geometry.initialY}
                    initiallyDocked={this.props.geometry.initiallyDocked}
                    key="View3DWindow"
                    maximizeable={false}
                    onClose={this.onClose}
                    onExternalWindowResized={this.redrawScene}
                    onGeometryChanged={this.onGeometryChanged}
                    splitScreenWhenDocked
                    splitTopAndBottomBar
                    title={LocaleUtils.tr("map3d.title")}
                >
                    {this.state.componentLoaded ? (
                        <Provider role="body" store={this.store}>
                            <Map3D
                                innerRef={this.setRef}
                                mapBBox={this.props.mapBBox} options={this.props.options}
                                projection={this.props.projection}
                                searchProviders={this.props.searchProviders}
                                theme={this.props.theme} />
                            {this.props.view3dMode === View3DMode.FULLSCREEN ? (
                                <PluginsContainer plugins={this.props.plugins} pluginsAppConfig={{}} pluginsConfig={this.props.pluginsConfig} />
                            ) : null}
                        </Provider>
                    ) : null}
                </ResizeableWindow>
            );
        }
        return null;
    };
    render() {
        const button = (
            <View3DSwitcher key="View3DButton" position={this.props.buttonPosition} />
        );
        return [button, this.render3DWindow()];
    }
    onClose = () => {
        this.props.setView3dMode(View3DMode.DISABLED);
    };
    onGeometryChanged = (geometry) => {
        if (geometry.maximized && this.props.display.view3dMode !== View3DMode.FULLSCREEN) {
            this.props.setView3dMode(View3DMode.FULLSCREEN);
        }
    };
    setRef = (ref) => {
        this.map3dComponentRef = ref;
    };
    setViewToExtent = () => {
        if (this.map3dComponentRef) {
            this.map3dComponentRef.setViewToExtent(this.props.mapBBox.bounds, this.props.mapBBox.rotation);
        }
    };
    redrawScene = (ev) => {
        if (this.map3dComponentRef) {
            this.map3dComponentRef.redrawScene(ev);
        }
    };
}

export default connect(
    createSelector([state => state, searchProvidersSelector], (state, searchProviders) => ({
        enabled: state.task.id === 'View3D',
        display: state.display,
        mapBBox: state.map.bbox,
        projection: state.map.projection,
        layers: state.layers,
        pluginsConfig: state.localConfig.plugins,
        theme: state.theme,
        localConfig: state.localConfig,
        view3dMode: state.display.view3dMode,
        startupParams: state.localConfig.startupParams,
        searchProviders
    })), {
        setCurrentTask: setCurrentTask,
        setView3dMode: setView3dMode
    }
)(View3D);
