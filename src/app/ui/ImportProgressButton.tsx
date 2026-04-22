import React from 'react'
import classnames from 'classnames'
import { Popover, Position, Button, Spinner, Icon } from '@blueprintjs/core'

import { msg } from 'common/i18n/i18n'
import { bindMany } from 'common/util/LangUtil'
import { formatNumber } from 'common/util/TextUtil'
import { ImportProgress } from 'common/CommonTypes'

import './ImportProgressButton.less'


export interface Props {
    className?: any
    progress: ImportProgress
    toggleImportPaused(): void
    cancelImport(): void
}

interface State {
    isShowingPopover: boolean
    isCancelling: boolean
}

export default class ImportProgressButton extends React.Component<Props, State> {

    constructor(props: Props) {
        super(props)
        this.state = { isShowingPopover: false, isCancelling: false }
        bindMany(this, 'onOpening', 'onClosed', 'onCancelImport')
    }

    private onOpening() {
        this.setState({ isShowingPopover: true })
    }

    private onClosed() {
        this.setState({ isShowingPopover: false })
    }

    private onCancelImport() {
        this.setState({ isCancelling: true })
        this.props.cancelImport()
    }

    render() {
        const { props, state } = this
        const { progress } = props

        const spinnerProgress = progress.phase === 'importPhotos' ? progress.processed / Math.max(1, progress.total) : undefined
        const hasError = progress.phase === 'error'

        const popoverContent = (
            <div className='ImportProgressButton-popoverBody'>
                {state.isShowingPopover &&
                    <>
                        <div className='ImportProgressButton-phase'>
                            {msg(`ImportProgressButton_phase_${progress.phase.replace(/-/g, '_')}` as any)}
                        </div>
                        {progress.currentPath &&
                            <div className='ImportProgressButton-currentPath'>
                                {progress.currentPath}
                            </div>
                        }
                        {spinnerProgress !== undefined &&
                            <div className='ImportProgressButton-percent'>
                                {`${Math.round(spinnerProgress * 100)}%`}
                            </div>
                        }
                        {progress.phase !== 'cleanup' &&
                            <div className='ImportProgressButton-ratio'>
                                {spinnerProgress ?
                                    msg('common_ratio', formatNumber(progress.processed), formatNumber(progress.total)) :
                                    formatNumber(progress.total)
                                }
                            </div>
                        }
                        {!hasError &&
                            <div className='ImportProgressButton-buttons'>
                                <Button
                                    text={msg(progress.isPaused ? 'ImportProgressButton_resume' : 'ImportProgressButton_pause')}
                                    disabled={state.isCancelling}
                                    onClick={props.toggleImportPaused}
                                />
                                <Button
                                    text={msg('common_cancel')}
                                    disabled={state.isCancelling}
                                    loading={state.isCancelling}
                                    onClick={this.onCancelImport}
                                />
                            </div>
                        }
                    </>
                }
            </div>
        )

        return (
            <Popover
                className={classnames(props.className, 'ImportProgressButton')}
                content={popoverContent}
                position={Position.TOP}
                onOpening={this.onOpening}
                onClosed={this.onClosed}
            >
                <Button minimal={true} rightIcon='caret-up'>
                    {!hasError && !progress.isPaused &&
                        <Spinner size={20} value={spinnerProgress} />
                    }
                    {!hasError && progress.isPaused &&
                        <Icon className='ImportProgressButton-pauseIcon' icon='pause' iconSize={20} />
                    }
                    {hasError &&
                        <Icon className='ImportProgressButton-error' icon='error' iconSize={20} />
                    }
                </Button>
            </Popover>
        )

    }

}
