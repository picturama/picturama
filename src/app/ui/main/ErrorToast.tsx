import React from 'react'
import { Button, IToastProps, Collapse } from '@blueprintjs/core'

import { msg } from 'common/i18n/i18n'
import { bindMany } from 'common/util/LangUtil'

import FaIcon from 'app/ui/widget/icon/FaIcon'

import './ErrorToast.less'


export interface Props {
    report: string
    onCopyReport(): void
    onDismiss(): void
}

export function createErrorToastProps(props: Props): IToastProps {
    return {
        className: 'ErrorToast',
        icon: <FaIcon className='ErrorToast-icon' name='frown-o' />,
        intent: 'danger',
        timeout: 0,
        message: <Message {...props}/>,
        onDismiss: props.onDismiss
    }
}


interface MessageState {
    showReport: boolean
}

class Message extends React.Component<Props, MessageState> {

    constructor(props: Props) {
        super(props)
        this.state = { showReport: false }
        bindMany(this, 'onToggleReport')
    }

    onToggleReport() {
        this.setState({ showReport: !this.state.showReport })
    }

    render() {
        const { props, state } = this
        return (
            <>
                <Button
                    className='ErrorToast-toggleReport'
                    minimal={true}
                    text={state.showReport ? msg('ErrorToast_hideReport') : msg('ErrorToast_showReport')}
                    onClick={this.onToggleReport}
                />
                {msg('ErrorToast_title')}
                <Collapse className='ErrorToast-reportCollapse' isOpen={state.showReport}>
                    <pre className='ErrorToast-report'>
                        {props.report}
                    </pre>
                    <div className='ErrorToast-reportBottomBar'>
                        <Button
                            minimal={true}
                            icon='clipboard'
                            text={msg('ErrorToast_copy')}
                            onClick={props.onCopyReport}
                        />
                    </div>
                </Collapse>
            </>
        )
    }

}
