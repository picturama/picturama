import React from 'react'
import { Toast } from '@blueprintjs/core'

import { createErrorToastProps, Props } from 'app/ui/main/ErrorToast'

import { addSection, action } from 'test-ui/core/UiTester'


const defaultProps: Props = {
    errorInfo: {
        technicalMsg: 'Test Error',
        processName: 'test',
        error: new Error('test'),
    },
    onReportCopied: action('onReportCopied'),
    onDismiss: action('onDismiss'),
}


addSection('ErrorToast')
    .add('normal', context => (
        <Toast {...createErrorToastProps(defaultProps)} />
    ))
