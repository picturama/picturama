import React from 'react'
import classnames from 'classnames'
import { Button, Classes, Popover, Position, Menu, MenuItem, MenuDivider } from '@blueprintjs/core'
import { MdImageAspectRatio } from 'react-icons/md'

import { PhotoWork } from 'app/CommonTypes'
import { msg } from 'app/i18n/i18n'
import { red } from 'app/style/variables'
import RotateButtonGroup from 'app/ui/widget/RotateButtonGroup'
import { SVG_ICON_CLASS } from 'app/ui/widget/icon/SvgIcon'
import Toolbar from 'app/ui/widget/Toolbar'
import { rotate } from 'app/util/EffectsUtil'
import { bindMany } from 'app/util/LangUtil'

import { aspectRatioTypes, AspectRatioType } from './DetailTypes'


export interface Props {
    className?: any
    aspectRatioType: AspectRatioType
    isAspectRatioLandscape: boolean
    photoWork: PhotoWork | null
    setAspectRatio(aspectRatioType: AspectRatioType, isLandscape: boolean | null): void
    onPhotoWorkEdited(photoWork: PhotoWork): void
    onDone(): void
}

export default class CropModeToolbar extends React.Component<Props> {

    constructor(props: Props) {
        super(props)
        bindMany(this, 'toggleAspectRatioLandscape', 'onRotate', 'onReset')
    }

    private toggleAspectRatioLandscape() {
        const { props } = this
        props.setAspectRatio(props.aspectRatioType, !props.isAspectRatioLandscape)
    }

    private onRotate(turns: number) {
        const prevPhotoWork = this.props.photoWork
        if (prevPhotoWork) {
            const photoWork = { ...prevPhotoWork }
            rotate(photoWork, turns, true)
            this.props.onPhotoWorkEdited(photoWork)
        }
    }

    private onReset() {
        const prevPhotoWork = this.props.photoWork
        if (prevPhotoWork) {
            const photoWork = { ...prevPhotoWork }
            delete photoWork.rotationTurns
            delete photoWork.tilt
            delete photoWork.cropRect
            this.props.onPhotoWorkEdited(photoWork)
        }
    }

    private renderAspectMenu(): JSX.Element {
        const { props } = this
        return (
            <Menu>
                {aspectRatioTypes.map(aspectRatioType =>
                    <MenuItem
                        key={aspectRatioType}
                        text={getAspectRatioLabel(aspectRatioType)}
                        active={props.aspectRatioType === aspectRatioType}
                        onClick={() => props.setAspectRatio(aspectRatioType, null)}
                    />
                )}
                {props.aspectRatioType !== 'free' && props.aspectRatioType !== '1:1' &&
                    <>
                        <MenuDivider/>
                        <MenuItem
                            text={msg(props.isAspectRatioLandscape ? 'CropModeToolbar_changeToPortrait' : 'CropModeToolbar_changeToLandscape')}
                            onClick={this.toggleAspectRatioLandscape}
                        />
                    </>
                }
            </Menu>
        )
    }

    render() {
        const { props } = this
        const { photoWork } = props
        const hasGeometryOperations = !!(photoWork && (photoWork.rotationTurns || photoWork.tilt || photoWork.cropRect))

        return (
            <Toolbar
                className={classnames(props.className, 'CropModeToolbar')}
                isLeft={true}
                isRight={true}
            >
                <Toolbar.Spacer/>
                <Popover
                    content={this.renderAspectMenu()}
                    position={Position.BOTTOM}
                >
                    <Button
                        minimal={true}
                        icon={
                            <MdImageAspectRatio
                                color={props.aspectRatioType === 'free' ? undefined : red} className={SVG_ICON_CLASS}
                            />
                        }
                    />
                </Popover>
                <RotateButtonGroup disabled={!props.photoWork} onRotate={this.onRotate}/>
                <Button disabled={!hasGeometryOperations} onClick={this.onReset}>
                    <span className={Classes.BUTTON_TEXT}>{msg('CropModeToolbar_reset')}</span>
                </Button>
                <Button intent='success' onClick={props.onDone}>
                    <span className={Classes.BUTTON_TEXT}>{msg('CropModeToolbar_done')}</span>
                </Button>
            </Toolbar>
        )
    }

}


function getAspectRatioLabel(aspectRatioType: AspectRatioType): string {
    switch (aspectRatioType) {
        case 'original': return msg('CropModeToolbar_aspect_original')
        case 'free': return msg('CropModeToolbar_aspect_free')
        case '1:1': return msg('CropModeToolbar_aspect_square')
        default: return aspectRatioType
    }
}
