import React from 'react'

import { createDefaultExportOptions } from 'app/state/reducers/export'
import { ExportDialog, Props } from 'app/ui/export/ExportDialog'

import { addSection, action, TestContext } from 'test-ui/core/UiTester'
import { PhotoExportOptions } from 'common/CommonTypes'


function createDefaultProps(context: TestContext): Props {
    if (!context.state.exportOptions) {
        context.state.exportOptions = {
            ...createDefaultExportOptions(),
            folderPath: '/Users/me/Temp/vacation-photos'
        } as PhotoExportOptions
    }
    return {
        usePortal: false,

        photos: {
            totalSelectedCount: 7,
            sectionSelectionById: {}
        },
        exportOptions: context.state.exportOptions,
        showRemoveInfoDesc: context.state.showRemoveInfoDesc || false,
        progress: null,

        onExportOptionsChange: (exportOptions: PhotoExportOptions) => {
            context.state.exportOptions = exportOptions
            context.forceUpdate()
        },
        onToggleShowRemoveInfoDesc: () => {
            context.state.showRemoveInfoDesc = !context.state.showRemoveInfoDesc
            context.forceUpdate()
        },
        onStartExport: action('onStartExport'),
        onClosed: action('onClosed'),
    }
}


addSection('ExportDialog')
    .add('normal', context => (
        <ExportDialog
            {...createDefaultProps(context)}
        />
    ))
    .add('all open', context => {
        const defaultProps = createDefaultProps(context)
        return (
            <ExportDialog
                {...defaultProps}
                exportOptions={{
                    ...defaultProps.exportOptions,
                    size: 'custom',
                    fileNameStyle: 'sequence',
                }}
                showRemoveInfoDesc={true}
            />
        )
    })
    .add('progress', context => (
        <ExportDialog
            {...createDefaultProps(context)}
            progress={{ processed: 2, total: 7 }}
        />
    ))
