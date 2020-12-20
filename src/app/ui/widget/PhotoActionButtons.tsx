import classNames from 'classnames'
import React from 'react'
import { Button, Classes } from '@blueprintjs/core'

import { PhotoId, Photo, PhotoWork, PhotoSectionId } from 'common/CommonTypes'
import { msg } from 'common/i18n/i18n'
import { rotate } from 'common/util/EffectsUtil'
import { bindMany } from 'common/util/LangUtil'
import { formatNumber } from 'common/util/TextUtil'

import toaster from 'app/Toaster'
import MdRestoreFromTrash from 'app/ui/widget/icon/MdRestoreFromTrash'

import RotateButtonGroup from './RotateButtonGroup'


interface Props {
    selectedSectionId: PhotoSectionId | null
    selectedPhotos: Photo[]
    isShowingTrash: boolean
    isShowingInfo: boolean
    openExport: (sectionId: PhotoSectionId, photoIds: PhotoId[]) => void
    updatePhotoWork: (photo: Photo, update: (photoWork: PhotoWork) => void) => void
    setPhotosFlagged: (photos: Photo[], flag: boolean) => void
    movePhotosToTrash: (photos: Photo[]) => void
    restorePhotosFromTrash: (photos: Photo[]) => void
    toggleShowInfo: () => void
}

export default class PhotoActionButtons extends React.Component<Props> {

    constructor(props: Props) {
        super(props)
        bindMany(this, 'onRotate', 'toggleFlagged', 'moveToTrash', 'restoreFromTrash', 'openExport')
    }

    private onRotate(turns: number) {
        const props = this.props
        for (const photo of props.selectedPhotos) {
            props.updatePhotoWork(photo, photoWork => rotate(photoWork, turns, true))
        }
    }

    toggleFlagged() {
        const props = this.props
        const newFlagged = !this.getSelectedAreFlagged()

        let photosToChange: Photo[] = []
        for (const photo of props.selectedPhotos) {
            if (!!photo.flag !== newFlagged) {
                photosToChange.push(photo)
            }
        }

        this.props.setPhotosFlagged(photosToChange, newFlagged)
    }

    getSelectedAreFlagged() {
        const props = this.props
        if (!props.selectedSectionId || props.selectedPhotos.length === 0) {
            return false
        } else {
            for (const photo of props.selectedPhotos) {
                if (!photo.flag) {
                    return false
                }
            }
            return true
        }
    }

    moveToTrash() {
        const selectedPhotos = this.props.selectedPhotos
        this.props.movePhotosToTrash(selectedPhotos)
        toaster.show({
            icon: 'tick',
            message: selectedPhotos.length === 1 ? msg('PhotoActionButtons_movedToTrash_one') : msg('PhotoActionButtons_movedToTrash_more', formatNumber(selectedPhotos.length)),
            intent: 'success'
        })
    }

    restoreFromTrash() {
        const selectedPhotos = this.props.selectedPhotos
        this.props.restorePhotosFromTrash(selectedPhotos)
        toaster.show({
            icon: 'tick',
            message: selectedPhotos.length === 1 ? msg('PhotoActionButtons_restoredFromTrash_one') : msg('PhotoActionButtons_restoredFromTrash_more', formatNumber(selectedPhotos.length)),
            intent: 'success'
        })
    }

    openExport() {
        const props = this.props
        const selectedPhotoIds = props.selectedPhotos.map(photo => photo.id)
        if (props.selectedSectionId) {
            props.openExport(props.selectedSectionId, selectedPhotoIds)
        }
    }

    render() {
        const props = this.props
        const hasSelection = props.selectedPhotos.length > 0
        const selectedAreFlagged = this.getSelectedAreFlagged()

        // TODO: Revive Legacy code of 'version' feature
        //const availableEditors = new AvailableEditors();
        //availableEditors.editors.forEach(editor =>
        //  this.menu.append(new MenuItem({
        //      label: `Open with ${editor.name}`,
        //      click: () => {
        //          createVersionAndOpenWith(
        //              this.props.photo,
        //              editor.format,
        //              editor.cmd
        //          );
        //      }
        //  }));
        //)

        return (
            <>
                <RotateButtonGroup disabled={!hasSelection} onRotate={this.onRotate}/>
                <Button
                    icon={selectedAreFlagged ? 'star' : 'star-empty'}
                    minimal={true}
                    active={selectedAreFlagged}
                    disabled={!hasSelection}
                    onClick={this.toggleFlagged}
                    title={selectedAreFlagged ? msg('PhotoActionButtons_removeFavorite') : msg('PhotoActionButtons_addFavorite')}
                />
                {!props.isShowingTrash &&
                    <Button minimal={true} icon="trash" disabled={!hasSelection} onClick={this.moveToTrash} title={msg('PhotoActionButtons_trash')}/>
                }
                {props.isShowingTrash &&
                    <Button
                        disabled={!hasSelection}
                        intent={hasSelection ? 'success' : undefined}
                        title={msg('PhotoActionButtons_restoreFromTrash')}
                        onClick={this.restoreFromTrash}
                    >
                        <MdRestoreFromTrash/>
                        <span className={Classes.BUTTON_TEXT}>{msg('PhotoActionButtons_restore')}</span>
                    </Button>
                }
                <Button
                    minimal={true}
                    icon="info-sign"
                    title={msg('PhotoActionButtons_photoInfo')}
                    active={props.isShowingInfo}
                    disabled={!hasSelection && !props.isShowingInfo}
                    onClick={this.props.toggleShowInfo}
                />
                <Button minimal={true} icon='export' disabled={!hasSelection} onClick={this.openExport} title={msg('PhotoActionButtons_export')}/>
            </>
        )    
    }
}
