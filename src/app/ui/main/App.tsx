import React, { ReactNode } from 'react'
import { bindActionCreators } from 'redux'
import { connect } from 'react-redux'
import { Button, NonIdealState } from '@blueprintjs/core'
import classNames from 'classnames'

import { msg } from 'common/i18n/i18n'
import { ImportProgress } from 'common/CommonTypes'

import BackgroundClient from 'app/BackgroundClient'
import { createGlobalCommands } from 'app/controller/GlobalCommandController'
import { addCommandGroup, Command, CommandGroupId, removeCommandGroup } from 'app/controller/HotkeyController'
import PhotoDetailPane from 'app/ui/detail/PhotoDetailPane'
import ExportDialog from 'app/ui/export/ExportDialog'
import Library from 'app/ui/library/Library'
import LibraryFilterButton from 'app/ui/library/LibraryFilterButton'
import ImportProgressButton from 'app/ui/ImportProgressButton'
import SettingsPane from 'app/ui/SettingsPane'
import { openSettingsAction } from 'app/state/actions'
import { AppState, MainViewState } from 'app/state/StateTypes'

import WindowControls from './WindowControls'

import './App.less'


interface OwnProps {
    style?: any
    className?: any
}

interface StateProps {
    isFullScreen: boolean
    hasWebGLSupport: boolean
    hasNativeTrafficLightButtons: boolean
    showWindowsButtons: boolean
    globalCommands: Command[] | null
    mainView: MainViewState
    importProgress: ImportProgress | null
    showExport: boolean
}

interface DispatchProps {
    toggleFullScreen(): void
    openSettings(): void
    toggleImportPaused(): void
    cancelImport(): void
}

interface Props extends OwnProps, StateProps, DispatchProps {
}

class App extends React.Component<Props> {

    private commandGroupId: CommandGroupId | null = null

    componentDidMount() {
        if (this.props.globalCommands) {
            this.commandGroupId = addCommandGroup(this.props.globalCommands)
        }

        const splashElem = document.getElementById('splash')
        if (splashElem) splashElem.parentNode!.removeChild(splashElem)
    }

    componentWillUnmount() {
        if (this.commandGroupId) {
            removeCommandGroup(this.commandGroupId)
        }
    }

    render() {
        const { props } = this

        let modalView: ReactNode | null = null
        if (props.showExport) {
            modalView = <ExportDialog />
        }

        let mainView: ReactNode | null = null
        if (!props.hasWebGLSupport) {
            mainView = (
                <div className='App-mainView App-globalError'>
                    <NonIdealState
                        icon='media'
                        title={msg('App_error_noWebGL_title')}
                        description={msg('App_error_noWebGL_desc')}
                    />
                </div>
            )
        } else if (props.mainView === 'settings') {
            mainView = <SettingsPane className='App-mainView'/>
        } else if (props.mainView === 'detail') {
            mainView = <PhotoDetailPane className='App-mainView' isActive={!modalView} />
        }

        return (
            <div className={classNames('App', { hasNativeTrafficLightButtons: props.hasNativeTrafficLightButtons, hasWindowsButtons: props.showWindowsButtons })}>
                <Library
                    className='App-container'
                    topBarLeftItem={
                        <>
                            {props.isFullScreen &&
                                <Button
                                    minimal={true}
                                    icon='minimize'
                                    onClick={props.toggleFullScreen}
                                />
                            }
                            <LibraryFilterButton/>
                            <Button
                                minimal={true}
                                icon='cog'
                                onClick={props.openSettings}
                            />
                        </>
                    }
                    bottomBarLeftItem={props.importProgress &&
                        <ImportProgressButton
                            progress={props.importProgress}
                            toggleImportPaused={props.toggleImportPaused}
                            cancelImport={props.cancelImport}
                        />
                    }
                    isActive={!mainView && !modalView}
                />
                {mainView}
                {modalView}
                {props.showWindowsButtons &&
                    <WindowControls
                        className='App-windowControls'
                    />
                }
            </div>
        );
    }
}


const Connected = connect<StateProps, DispatchProps, OwnProps, AppState>(
    (state, props) => {
        const { uiConfig } = state.data
        return {
            ...props,
            isFullScreen: state.navigation.isFullScreen,
            hasWebGLSupport: state.navigation.hasWebGLSupport,
            hasNativeTrafficLightButtons: uiConfig.windowStyle === 'nativeTrafficLight' && !state.navigation.isFullScreen,
            showWindowsButtons: uiConfig.windowStyle === 'windowsButtons',
            globalCommands: uiConfig.hasNativeMenu ? null : createGlobalCommands(),
            mainView: state.navigation.mainView,
            importProgress: state.import && state.import.progress,
            showExport: !!state.export,
        }
    },
    dispatch => ({
        toggleFullScreen() { BackgroundClient.toggleFullScreen() },
        toggleImportPaused() { BackgroundClient.toggleImportPaused() },
        cancelImport() { BackgroundClient.cancelImport() },
        ...bindActionCreators({
            openSettings: openSettingsAction
        }, dispatch)
    })
)(App)

export default Connected
