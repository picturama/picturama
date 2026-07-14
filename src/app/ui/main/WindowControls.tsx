import React from 'react'
import classnames from 'classnames'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'

import { showError } from 'app/ErrorPresenter'
import SvgIcon from 'app/ui/widget/icon/SvgIcon'
import { bindMany } from 'app/util/LangUtil'

import './WindowControls.less'


interface WindowStatePayload {
    isMaximized: boolean
    isFullscreen: boolean
}

export interface Props {
    className?: any
}

interface State {
    isMaximized: boolean
}

export default class WindowControls extends React.Component<Props, State> {

    private unlistenWindowState: UnlistenFn | null = null

    constructor(props: Props) {
        super(props)
        this.state = { isMaximized: false }
        bindMany(this, 'onClose', 'onMaximize', 'onMinimize', 'onWindowStateChanged')
    }

    componentDidMount() {
        // Seed initial state from Rust
        invoke<WindowStatePayload>('window_get_state')
            .then(windowState => {
                this.setState({ isMaximized: windowState.isMaximized })
        
                // Subscribe to future changes (maximize, unmaximize, fullscreen toggle)
                return listen<WindowStatePayload>('window-state-changed', this.onWindowStateChanged)
            })
            .then(unlistenWindowState => {
                this.unlistenWindowState = unlistenWindowState
            })
            .catch(error => {
                showError('Listening to window state failed', error)
            })
    }

    componentWillUnmount() {
        this.unlistenWindowState?.()
    }

    private onWindowStateChanged(event: { payload: WindowStatePayload }) {
        this.setState({ isMaximized: event.payload.isMaximized })
    }

    private onClose() {
        invoke('window_close')
    }

    private onMaximize() {
        invoke(this.state.isMaximized ? 'window_unmaximize' : 'window_maximize')
    }

    private onMinimize() {
        invoke('window_minimize')
    }

    render() {
        const { props, state } = this
        return (
            <div className={classnames(props.className, 'WindowControls')}>
                <div className='WindowControls-button' onClick={this.onMinimize}>
                    <SvgIcon size={10}>
                        <path d='M0,5.5l10,0'/>
                    </SvgIcon>
                </div>
                <div className='WindowControls-button' onClick={this.onMaximize}>
                    <SvgIcon size={10}>
                        <path d={state.isMaximized
                            ? 'M0.5,2.5l7,0l0,7l-7,0zM2.5,2.5l0,-2l7,0l0,7l-2,0'
                            : 'M0.5,0.5l9,0l0,9l-9,0z'}
                        />
                    </SvgIcon>
                </div>
                <div className='WindowControls-button WindowControls-closeButton' onClick={this.onClose}>
                    <SvgIcon size={10}>
                        <path d='M0,0l10,10M0,10l10,-10'/>
                    </SvgIcon>
                </div>
            </div>
        )
    }

}
