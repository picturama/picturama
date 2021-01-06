import React, { ReactNode } from 'react'
import { connect } from 'react-redux'
import { Button } from '@blueprintjs/core'
import classnames from 'classnames'

import { Settings } from 'common/CommonTypes'
import { msg } from 'common/i18n/i18n'
import { bindMany } from 'common/util/LangUtil'

import BackgroundClient from 'app/BackgroundClient'
import { showError } from 'app/ErrorPresenter'
import Toolbar from 'app/ui/widget/Toolbar'
import FaIcon from 'app/ui/widget/icon/FaIcon'
import List from 'app/ui/widget/List'
import LogoDecoration from 'app/ui/widget/LogoDecoration'
import { setSettingsAction, closeSettingsAction } from 'app/state/actions'
import { AppState } from 'app/state/StateTypes'

import './SettingsPane.less'


export interface OwnProps {
    style?: any
    className?: any
}

interface StateProps {
    settings: Settings
}

interface DispatchProps {
    selectDirectories(): Promise<string[] | undefined>
    onSettingsChange(settings: Settings): void
    onClose(settings: Settings, startImport: boolean): void
}

export interface Props extends OwnProps, StateProps, DispatchProps {}

export class SettingsPane extends React.Component<Props> {

    constructor(props: Props) {
        super(props)
        bindMany(this, 'onPhotoDirsChange', 'onAddPhotoDir', 'onClose', 'onCloseAndImport', 'getDecorationWidth')
    }

    private onPhotoDirsChange(photoDirs: string[]) {
        this.props.onSettingsChange({ ...this.props.settings, photoDirs })
    }

    private onAddPhotoDir() {
        const { props } = this
        props.selectDirectories()
            .then(dirs => {
                if (dirs) {
                    const nextPhotoDirs = [ ...props.settings.photoDirs, ...dirs ]
                    nextPhotoDirs.sort()
                    props.onSettingsChange({ ...props.settings, photoDirs: nextPhotoDirs })
                }
            })
            .catch(error => {
                console.error('Selecting dirs failed', error)
            })
    }

    private onClose() {
        this.props.onClose(this.props.settings, false)
    }

    private onCloseAndImport() {
        this.props.onClose(this.props.settings, true)
    }

    private getDecorationWidth(containerWidth: number): number {
        return containerWidth - 800
    }

    render() {
        const { props } = this
        const { settings } = props
        return (
            <div className={classnames(props.className, 'SettingsPane')} style={props.style}>
                <LogoDecoration getDecorationWidth={this.getDecorationWidth}/>
                <Toolbar
                    className="SettingsPane-topBar"
                    isTopBar={true}
                    isLeft={true}
                >
                    <Button onClick={this.onClose}>
                        <FaIcon name="chevron-left"/>
                        <span>{msg('common_backToLibrary')}</span>
                    </Button>
                    <Toolbar.Spacer/>
                </Toolbar>                
                <div className='SettingsPane-body'>
                    <div className='SettingsPane-content'>
                        <h1>{msg('Settings_title')}</h1>
                        {settings.photoDirs.length === 0 &&
                            <p>{msg('Settings_selectPhotoDirs')}</p>
                        }
                        {settings.photoDirs.length > 0 &&
                            <>
                                <p>{msg('Settings_photoDirs')}</p>
                                <List
                                    items={settings.photoDirs}
                                    renderItem={renderPhotoDir}
                                    onItemsChange={this.onPhotoDirsChange}
                                />
                            </>
                        }
                        <Button
                            className='SettingsPane-addPhotoDir'
                            text={msg('Settings_addPhotoDir')}
                            onClick={this.onAddPhotoDir}
                        />
                    </div>
                </div>
                <div className='SettingsPane-buttonBar'>
                    <Button
                        large={true}
                        intent='primary'
                        text={msg('Settings_startScan')}
                        onClick={this.onCloseAndImport}
                    />
                </div>
            </div>
        )
    }

}


function renderPhotoDir(photoDir: string): ReactNode {
    return photoDir
}


const Connected = connect<StateProps, DispatchProps, OwnProps, AppState>(
    (state: AppState, props: OwnProps) => {
        return {
            ...props,
            settings: state.data.settings
        }
    },
    dispatch => ({
        selectDirectories: BackgroundClient.selectScanDirectories,
        onSettingsChange(settings: Settings) {
            dispatch(setSettingsAction(settings))
        },
        onClose(settings: Settings, startImport: boolean) {
            dispatch(closeSettingsAction())
            BackgroundClient.storeSettings(settings)
                .then(() => {
                    if (startImport) {
                        BackgroundClient.startImport()
                    }
                })
                .catch(error => {
                    showError('Applying new settings failed', error)
                })
        },
    })
)(SettingsPane)

export default Connected
