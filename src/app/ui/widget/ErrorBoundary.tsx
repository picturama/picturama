import React from 'react'
import classNames from 'classnames'
import { Button, Collapse, NonIdealState } from '@blueprintjs/core'
import { FaFrownOpen } from 'react-icons/fa'

import { msg } from 'app/i18n/i18n'
import { bindMany } from 'app/util/LangUtil'

import ErrorReport, { ErrorInfo } from './ErrorReport'


const basicTechnicalMsg = 'UI error'

export type Props = {
    className?: any
    children?: any
    addDecorator?: (content: JSX.Element) => JSX.Element
}

interface State {
    errorInfo?: ErrorInfo
    showReport: boolean
}

export default class ErrorBoundary extends React.Component<Props, State> {

    constructor(props: Props) {
        super(props)
        bindMany(this, 'onToggleReport')
        this.state = { showReport: false }
    }

    componentDidCatch(error: Error, reactErrorInfo: React.ErrorInfo) {
        this.setState({
            errorInfo: {
                technicalMsg: basicTechnicalMsg,
                processName: 'app',
                error,
                reactErrorInfo,
            },
            showReport: false
        })
    }

    onToggleReport() {
        this.setState({ showReport: !this.state.showReport })
    }

    render() {
        const { props, state } = this
        if (state.errorInfo) {
            const content = (
                <NonIdealState
                    className={classNames(props.className, 'ErrorBoundary')}
                    icon={<FaFrownOpen/>}
                    title={msg('common_error')}
                    description={
                        <Collapse isOpen={state.showReport}>
                            <ErrorReport errorInfo={state.errorInfo}/>
                        </Collapse>
                    }
                    action={
                        <div>
                            <Button
                                text={state.showReport ? msg('common_hideReport') : msg('common_showReport')}
                                onClick={this.onToggleReport}
                            />
                            <Button
                                text={msg('common_reloadUi')}
                                onClick={reloadUi}
                            />
                        </div>
                    }
                />
            )

            return props.addDecorator?.(content) ?? content
        } else {
            return props.children
        }
    }

}


function reloadUi() {
    location.reload()
}
