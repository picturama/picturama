import toaster from 'app/Toaster'
import { createErrorToastProps } from 'app/ui/main/ErrorToast'

import { ErrorInfo } from './ui/widget/ErrorReport'


let errorToastKey: string | undefined = undefined


export function showError(msg: string, error?: unknown) {
    console.error(msg, error)
    showErrorToast({
        technicalMsg: msg,
        processName: 'app',
        error,
    })
}


export function showExternalError(processName: string, msg: string, errorStack?: string) {
    showErrorToast({
        technicalMsg: msg,
        processName,
        errorStack,
    })
}


function showErrorToast(errorInfo: ErrorInfo) {
    if (errorToastKey) {
        return
    }

    errorToastKey = toaster.show(createErrorToastProps({
        errorInfo,
        onReportCopied,
        onDismiss
    }))
}


function onReportCopied() {
    toaster.dismiss(errorToastKey!)
}


function onDismiss() {
    errorToastKey = undefined
}
