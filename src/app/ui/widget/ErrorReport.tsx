import React from 'react'
import classnames from 'classnames'
import copyTextToClipboard from 'copy-text-to-clipboard'
import { mapStackTrace } from 'sourcemapped-stacktrace'
import { Button } from '@blueprintjs/core'

import { getLocale, msg } from 'app/i18n/i18n'
import toaster from 'app/Toaster'
import { getPlatform, getVersion } from 'app/util/DataUtil'
import { bindMany } from 'app/util/LangUtil'

import './ErrorReport.less'


let mapStackTraceOptions: any = undefined
if (navigator.userAgent.toLowerCase().indexOf('like gecko') > -1) {
    // Workaround: On Mac OS 'sourcemapped-stacktrace' can't detect the browser type of the AppleWebKit view
    mapStackTraceOptions = { traceFormat: 'firefox' }
}


export interface ErrorInfo {
    technicalMsg: string
    processName: string
    error?: unknown
    errorStack?: string
    reactErrorInfo?: React.ErrorInfo
}

export interface Props {
    className?: any
    errorInfo: ErrorInfo
    onReportCopied?: () => void
}

interface State {
    report: string
}

export default class ErrorReport extends React.Component<Props, State> {

    constructor(props: Props) {
        super(props)
        bindMany(this, 'onCopyReport')

        const { errorInfo } = props
        this.state = {
            report: formatReport(errorInfo, null)
        }
        if (errorInfo.error instanceof Error) {
            mapStackTrace(
                errorInfo.error.stack,
                mappedStack => {
                    this.setState({
                        report: formatReport(errorInfo, mappedStack)
                    })
                },
                mapStackTraceOptions)
        }
    }

    private onCopyReport() {
        copyTextToClipboard('```\n' + this.state.report + '\n```')
        this.props.onReportCopied?.()
        toaster.show({
            intent: 'success',
            icon: 'tick',
            message: msg('ErrorController_copied')
        })
    }

    render() {
        const { props, state } = this
        return (
            <div className={classnames(props.className, 'ErrorReport')}>
                <pre className='ErrorReport-report'>
                    {state.report}
                </pre>
                <div className='ErrorReport-bottomBar'>
                    <Button
                        minimal={true}
                        icon='clipboard'
                        text={msg('ErrorReport_copy')}
                        onClick={this.onCopyReport}
                    />
                </div>
            </div>
        )
    }

}


function formatReport(errorInfo: ErrorInfo, resolvedStack: string[] | null): string {
    const { error, errorStack, reactErrorInfo } = errorInfo

    let report = `${errorInfo.technicalMsg}\n\nVersion: ${getVersion()}\nPlatform: ${getPlatform()}\nLocale: ${getLocale()}\n` +
        `Process: ${errorInfo.processName}\nUser agent: ${navigator.userAgent}`
    if (error instanceof Error) {
        report += '\n\n' + error.name + ': ' + error.message
    } else if (error) {
        report += '\n\n' + error
    }
    if (resolvedStack) {
        report += '\n' + resolvedStack.join('\n')
    }
    if (errorStack) {
        report += '\n\n' + errorStack
    }
    if (reactErrorInfo) {
        report += '\n\nComponent stack:\n' + reactErrorInfo.componentStack
    }

    return report
}
