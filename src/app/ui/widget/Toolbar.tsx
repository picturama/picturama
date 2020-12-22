import React from 'react'
import classnames from 'classnames'
import { remote } from 'electron'

import { bindMany } from 'common/util/LangUtil'

import './Toolbar.less'


interface ToolbarSpacerProps {
}

class ToolbarSpacer extends React.Component<ToolbarSpacerProps> {

    constructor(props: Props) {
        super(props)
        bindMany(this, 'onDoubleClick')
    }

    private onDoubleClick() {
        const currentWindow = remote.getCurrentWindow()
        if (currentWindow.isMaximized()) {
            currentWindow.unmaximize()
        } else {
            currentWindow.maximize()
        }
    }

    render() {
        return (
            <div className='Toolbar-spacer' onDoubleClick={this.onDoubleClick}/>
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
        const props = this.props
        return (
            <div
                id={props.id}
                className={classnames(props.className, 'Toolbar bp3-dark', { isTopBar: props.isTopBar, isLeft: props.isLeft, isRight: props.isRight })}
                style={props.style}
            >
                {props.children}
            </div>
        )
    }
}
