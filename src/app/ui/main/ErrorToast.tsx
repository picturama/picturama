import React from 'react'
import { Button, Collapse, IToastProps } from '@blueprintjs/core'
import { FaFrownOpen } from 'react-icons/fa'

import { msg } from 'app/i18n/i18n'
import ErrorReport, { ErrorInfo } from 'app/ui/widget/ErrorReport'
import { bindMany } from 'app/util/LangUtil'

import './ErrorToast.less'


export interface Props {
    errorInfo: ErrorInfo
    onReportCopied(): void
    onDismiss(): void
}

export function createErrorToastProps(props: Props): IToastProps {
    return {
        className: 'ErrorToast',
        icon: <FaFrownOpen className='ErrorToast-icon'/>,
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
        bindMany(this, 'onToggleReport')
        this.state = { showReport: false }
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
                    minimal
                    text={state.showReport ? msg('common_hideReport') : msg('common_showReport')}
                    onClick={this.onToggleReport}
                />
                {msg('common_error')}
                <Collapse className='ErrorToast-reportCollapse' isOpen={state.showReport}>
                    <ErrorReport
                        errorInfo={props.errorInfo}
                        onReportCopied={props.onReportCopied}
                    />
                </Collapse>
            </>
        )
    }

}
