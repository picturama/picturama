import React from 'react'
import { connect } from 'react-redux'
import classnames from 'classnames'
import { Dialog, Classes, Button, Label, HTMLSelect, Collapse, Card, Checkbox, Spinner } from '@blueprintjs/core'

import { photoRenderFormats, PhotoExportOptions, PhotoExportCustomSizeSide, PhotoExportSizeType, PhotoExportFileNameStyle, PhotoExportProgress } from 'common/CommonTypes'
import { msg, splitMsg } from 'common/i18n/i18n'
import { bindMany } from 'common/util/LangUtil'
import { formatNumber } from 'common/util/TextUtil'

import { CustomSizeSideWidth, CustomSizeSideHeight, CustomSizeSideSize, customSizeSideIconSize } from 'app/ui/widget/icon/export'
import { SvgIconFactory } from 'app/ui/widget/icon/SvgIcon'
import { setExportOptionsAction, toggleShowExportRemoveInfoDescAction } from 'app/state/actions'
import { AppState, PhotoCollection } from 'app/state/StateTypes'
import { getCollectionSize } from 'app/util/PhotoCollectionResolver'

import ExportDialogController from './ExportDialogController'

import './ExportDialog.less'


const iconByCustomSizeSide : { [K in PhotoExportCustomSizeSide]: SvgIconFactory } = {
    width: CustomSizeSideWidth,
    height: CustomSizeSideHeight,
    size: CustomSizeSideSize,
}


export interface OwnProps {
    usePortal?: boolean
}

interface StateProps {
    photos: PhotoCollection
    exportOptions: PhotoExportOptions
    showRemoveInfoDesc: boolean
    progress: PhotoExportProgress | null
}

interface DispatchProps {
    onExportOptionsChange(exportOptions: PhotoExportOptions): void
    onToggleShowRemoveInfoDesc(): void
    onStartExport(): void
    onClosed(): void
}

export interface Props extends OwnProps, StateProps, DispatchProps {}

interface State {
    isOpen: boolean
}

export class ExportDialog extends React.Component<Props, State> {

    private qualities: { value: number, label: string }[]
    private sizes: { value: PhotoExportSizeType, label: string }[]
    private customSizeSides: { value: PhotoExportCustomSizeSide, label: string }[]
    private fileNameStyles: { value: PhotoExportFileNameStyle, label: string }[]

    constructor(props: Props) {
        super(props)
        bindMany(this, 'onClose', 'onFormatChange', 'onQualityChange', 'onSizeChange', 'onCustomSizeSideChange',
            'onCustomSizePixelsChange', 'toggleWithMetadata', 'onFileNameStyleChange', 'onFileNamePrefixChange')

        this.qualities = [
            { value: 0.5,  label: msg('ExportDialog_quality_low', 50) },
            { value: 0.7,  label: msg('ExportDialog_quality_medium', 70) },
            { value: 0.9,  label: msg('ExportDialog_quality_high', 90) },
            { value: 1, label: msg('ExportDialog_quality_max', 100) }
        ]
        this.sizes = [
            { value: 'S',        label: msg('ExportDialog_size_S', '6 kP') },
            { value: 'M',        label: msg('ExportDialog_size_M', `${formatNumber(0.2, 1)} MP`) },
            { value: 'L',        label: msg('ExportDialog_size_L', '1 MP')},
            { value: 'original', label: msg('ExportDialog_size_original') },
            { value: 'custom',   label: msg('ExportDialog_size_custom') },
        ]
        this.customSizeSides = [
            { value: 'width',  label: msg('ExportDialog_customSizeSide_width') },
            { value: 'height', label: msg('ExportDialog_customSizeSide_height') },
            { value: 'size',   label: msg('ExportDialog_customSizeSide_size') },
        ]
        this.fileNameStyles = [
            { value: 'like-original', label: msg('ExportDialog_fileName_likeOriginal') },
            { value: 'sequence',      label: msg('ExportDialog_fileName_sequence') },
        ]

        this.state = { isOpen: true }
    }

    private onClose() {
        this.setState({ isOpen: false })
    }

    private onFormatChange(event: React.ChangeEvent<HTMLSelectElement>) {
        this.props.onExportOptionsChange({ ...this.props.exportOptions, format: event.currentTarget.value as any })
    }

    private onQualityChange(event: React.ChangeEvent<HTMLSelectElement>) {
        this.props.onExportOptionsChange({ ...this.props.exportOptions, quality: parseFloat(event.currentTarget.value) })
    }

    private onSizeChange(event: React.ChangeEvent<HTMLSelectElement>) {
        this.props.onExportOptionsChange({ ...this.props.exportOptions, size: event.currentTarget.value as any })
    }

    private onCustomSizeSideChange(event: React.ChangeEvent<HTMLSelectElement>) {
        this.props.onExportOptionsChange({ ...this.props.exportOptions, customSizeSide: event.currentTarget.value as any })
    }

    private onCustomSizePixelsChange(event: React.ChangeEvent<HTMLInputElement>) {
        this.props.onExportOptionsChange({ ...this.props.exportOptions, customSizePixels: parseInt(event.currentTarget.value) })
    }

    private toggleWithMetadata() {
        this.props.onExportOptionsChange({ ...this.props.exportOptions, withMetadata: !this.props.exportOptions.withMetadata })
    }

    private onFileNameStyleChange(event: React.ChangeEvent<HTMLSelectElement>) {
        this.props.onExportOptionsChange({ ...this.props.exportOptions, fileNameStyle: event.currentTarget.value as any })
    }

    private onFileNamePrefixChange(event: React.ChangeEvent<HTMLInputElement>) {
        this.props.onExportOptionsChange({ ...this.props.exportOptions, fileNamePrefix: event.currentTarget.value })
    }

    render() {
        const { props, state } = this

        let content: any
        if (props.progress) {
            content = this.renderProgress()
        } else {
            content = this.renderForm()
        }

        const photosCount = getCollectionSize(props.photos)
        return (
            <Dialog
                className='ExportDialog'
                usePortal={props.usePortal}
                isOpen={state.isOpen}
                icon='export'
                title={photosCount === 1 ? msg('ExportDialog_title_one') : msg('ExportDialog_title_more', photosCount)}
                canOutsideClickClose={!props.progress}
                canEscapeKeyClose={!props.progress}
                isCloseButtonShown={!props.progress}
                onClose={this.onClose}
                onClosed={props.onClosed}
            >
                {content}
            </Dialog>
        )
    }

    private renderForm() {
        const { props } = this
        const { exportOptions } = props
        const isQualityDisabled = exportOptions.format === 'png'
        const CustomSizeSideIcon = iconByCustomSizeSide[exportOptions.customSizeSide]
        return (
            <>
                <div className='ExportDialog-form'>

                    <Label htmlFor='format'>{msg('ExportDialog_format')}</Label>
                    <HTMLSelect
                        id='format'
                        value={exportOptions.format}
                        options={photoRenderFormats}
                        onChange={this.onFormatChange}
                    />

                    <Label htmlFor='quality' disabled={isQualityDisabled}>{msg('ExportDialog_quality')}</Label>
                    <HTMLSelect
                        id='quality'
                        disabled={isQualityDisabled}
                        value={isQualityDisabled ? 1 : exportOptions.quality}
                        options={this.qualities}
                        onChange={this.onQualityChange}
                    />

                    <Label htmlFor='size' disabled={isQualityDisabled}>{msg('ExportDialog_size')}</Label>
                    <HTMLSelect
                        id='size'
                        value={exportOptions.size}
                        options={this.sizes}
                        onChange={this.onSizeChange}
                    />

                    <Collapse
                        className='ExportDialog-customSize'
                        isOpen={exportOptions.size === 'custom'}
                    >
                        <Card className='ExportDialog-customSizeBody'>
                            <div>
                                {splitMsg('ExportDialog_customSizeSettings').map((split, splitIndex) =>
                                    split === '{0}' ? (
                                        <HTMLSelect
                                            key={splitIndex}
                                            className='ExportDialog-customSizeSide'
                                            value={exportOptions.customSizeSide}
                                            options={this.customSizeSides}
                                            onChange={this.onCustomSizeSideChange}
                                        />
                                    ) : split === '{1}' ? (
                                        <input
                                            key={splitIndex}
                                            className={classnames(Classes.INPUT, 'ExportDialog-customSizePixels')}
                                            type='number'
                                            value={exportOptions.customSizePixels}
                                            min={1}
                                            onChange={this.onCustomSizePixelsChange}
                                        />
                                    ) : split
                                )}
                            </div>
                            <CustomSizeSideIcon
                                className='ExportDialog-customSizeSideIcon'
                                size={customSizeSideIconSize}
                            />
                        </Card>
                    </Collapse>

                    <Label htmlFor='removeInfo' disabled={isQualityDisabled}>{msg('ExportDialog_privacy')}</Label>
                    <div>
                        <div>
                            <Checkbox
                                id='removeInfo'
                                className='ExportDialog-removeInfo'
                                inline={true}
                                checked={exportOptions.format !== 'jpg' || !exportOptions.withMetadata}
                                disabled={exportOptions.format !== 'jpg'}
                                label={msg('ExportDialog_removeInfo')}
                                onChange={this.toggleWithMetadata}
                            />
                            <Button
                                className='ExportDialog-removeInfoToggleDesc'
                                minimal={true}
                                active={props.showRemoveInfoDesc}
                                icon='info-sign'
                                onClick={props.onToggleShowRemoveInfoDesc}
                            />
                        </div>
                        <Collapse isOpen={props.showRemoveInfoDesc}>
                            <div className={classnames(Classes.TEXT_SMALL, Classes.TEXT_MUTED, 'ExportDialog-removeInfoDesc')}>
                                <p>{msg('ExportDialog_removeInfo_desc')}</p>
                                <p>{msg('ExportDialog_removeInfo_jpgOnly')}</p>
                            </div>
                        </Collapse>
                    </div>

                    <Label htmlFor='fileNameStyle' disabled={isQualityDisabled}>{msg('ExportDialog_fileName')}</Label>
                    <div className='ExportDialog-fileName'>
                        <HTMLSelect
                            id='fileNameStyle'
                            className='ExportDialog-fileNameStyle'
                            value={exportOptions.fileNameStyle}
                            options={this.fileNameStyles}
                            onChange={this.onFileNameStyleChange}
                        />
                        <Collapse
                            isOpen={exportOptions.fileNameStyle === 'sequence'}
                        >
                            <Label className='ExportDialog-fileNamePrefixLabel'>
                                {msg('ExportDialog_fileName_sequencePrefix')}
                                <input
                                    className={classnames(Classes.INPUT, Classes.FILL)}
                                    type='text'
                                    value={exportOptions.fileNamePrefix}
                                    onChange={this.onFileNamePrefixChange}
                                />
                                <div className={classnames(Classes.TEXT_SMALL, Classes.TEXT_MUTED, 'ExportDialog-sequenceExample')}>
                                    {msg('ExportDialog_fileName_sequenceExample', `${exportOptions.fileNamePrefix}12.${exportOptions.format}`)}
                                </div>
                            </Label>
                        </Collapse>
                    </div>

                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Button onClick={this.onClose}>{msg('common_cancel')}</Button>
                        <Button onClick={props.onStartExport} intent='primary'>{msg('ExportDialog_export')}</Button>
                    </div>
                </div>
            </>
        )
    }

    private renderProgress() {
        const { props } = this
        const progress = props.progress!
        const spinnerProgress = progress.processed / progress.total
        return (
            <>
                <div className='ExportDialog-progressBody'>
                    <div className='ExportDialog-progressFolder'>
                        {msg('ExportDialog_exportingTo', props.exportOptions.folderPath)}
                    </div>
                    <Spinner size={120} value={spinnerProgress} />
                    <div className='ExportDialog-progressPercent'>
                        {`${Math.round(spinnerProgress * 100)}%`}
                    </div>
                    <div className='ExportDialog-progressRatio'>
                        {msg('common_ratio', formatNumber(progress.processed), formatNumber(progress.total))}
                    </div>
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={classnames('ExportDialog-progressActions', Classes.DIALOG_FOOTER_ACTIONS)}>
                        <Button onClick={this.onClose}>{msg('common_cancel')}</Button>
                    </div>
                </div>
            </>
        )
    }

}


const Connected = connect<StateProps, DispatchProps, OwnProps, AppState>(
    (state: AppState, props: OwnProps) => {
        const exportState = state.export!
        return {
            ...props,
            photos: exportState.photos,
            exportOptions: exportState.exportOptions,
            showRemoveInfoDesc: exportState.showRemoveInfoDesc,
            progress: exportState.progress,
        }
    },
    dispatch => ({
        onExportOptionsChange: (exportOptions: PhotoExportOptions) => dispatch(setExportOptionsAction(exportOptions)),
        onToggleShowRemoveInfoDesc: () => dispatch(toggleShowExportRemoveInfoDescAction()),
        onStartExport: ExportDialogController.startExport,
        onClosed: ExportDialogController.cancelExport
    })
)(ExportDialog)

export default Connected
