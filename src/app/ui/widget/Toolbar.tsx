import React from 'react'
import classnames from 'classnames'
import { invoke } from '@tauri-apps/api/core'

import { showError } from 'app/ErrorPresenter'
import { bindMany } from 'common/util/LangUtil'

import './Toolbar.less'


interface ToolbarSpacerProps {
    isTopBar?: boolean
}

class ToolbarSpacer extends React.Component<ToolbarSpacerProps> {

    constructor(props: ToolbarSpacerProps) {
        super(props)
        bindMany(this, 'onDoubleClick')
    }

    private onDoubleClick() {
        invoke<{ isMaximized: boolean }>('window_get_state')
            .then(state => {
                invoke(state.isMaximized ? 'window_unmaximize' : 'window_maximize')
            })
            .catch(error => {
                showError('Handling toolbar double click failed', error)
            })
    }

    render() {
        const { props } = this
        return (
            <div
                className='Toolbar-spacer'
                data-tauri-drag-region={props.isTopBar}
                onDoubleClick={this.onDoubleClick}
            />
        )
    }

}


interface Props {
    id?: string
    className?: any
    style?: any
    children?: any
    isTopBar: boolean
    isLeft?: boolean
    isRight?: boolean
}

export default class Toolbar extends React.Component<Props> {

    static Spacer = ToolbarSpacer

    static defaultProps: Partial<Props> = {
        isLeft: false
    }

    render() {
        const { props } = this
        return (
            <div
                id={props.id}
                className={classnames(props.className, 'Toolbar bp3-dark', { isTopBar: props.isTopBar, isLeft: props.isLeft, isRight: props.isRight })}
                style={props.style}
                data-tauri-drag-region={props.isTopBar}
            >
                {props.children}
            </div>
        )
    }
}
