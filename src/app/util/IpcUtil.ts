import { IpcErrorInfo } from 'app/CommonTypes'

import { getErrorCode, addErrorCode } from './LangUtil'


export function encodeIpcError(error: any): IpcErrorInfo {
    const errorInfo: IpcErrorInfo = {
        message: (error instanceof Error) ? error.message : ('' + error)
    }

    const errorCode = getErrorCode(error)
    if (errorCode) {
        errorInfo.errorCode = errorCode
    }

    return errorInfo
}


export function decodeIpcError(errorInfo: IpcErrorInfo): Error {
    const error = new Error(errorInfo.message)
    if (errorInfo.errorCode) {
        addErrorCode(error, errorInfo.errorCode)
    }
    return error
}
