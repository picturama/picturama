import React from 'react'
import classNames from 'classnames'
import { findDOMNode } from 'react-dom'
import { Button, Icon } from '@blueprintjs/core'
import { FaCheckCircle, FaRegCircle } from 'react-icons/fa'

import { msg } from 'common/i18n/i18n'
import CancelablePromise, { isCancelError } from 'common/util/CancelablePromise'
import { bindMany, getErrorCode } from 'common/util/LangUtil'
import { PhotoId, Photo, PhotoSectionId } from 'common/CommonTypes'

import { LibrarySelectionController } from 'app/controller/LibrarySelectionController'
import { formatCommandLabel } from 'app/controller/HotkeyController'
import { selectionButtonSize, toolbarHeight } from 'app/style/variables'
import { JustifiedLayoutBox } from 'app/UITypes'
import RedCheckCircle from 'app/ui/widget/icon/RedCheckCircle'

import './Picture.less'


export const showDetailsCombo = 'enter'
export const toggleSelectedCombo = 'space'


export interface Props {
    className?: any
    inSelectionMode: boolean
    sectionId: PhotoSectionId
    photo: Photo
    layoutBox: JustifiedLayoutBox
    /** Whether this photo is the active photo (which has the keyboard focus) */
    isActive: boolean
    isSelected: boolean
    /**
     * Whether this photo is pre-(de)-selected. E.g. if the user holds the shift key while hovering another photo
     * and this photo is between the active photo and the hovered photo.
     * Is `undefined` if this photo is not pre-(de)-selected, `true` if it is preselected and
     * `false` if it is pre-deselected.
     */
    preselected?: boolean
    librarySelectionController: LibrarySelectionController
    getThumbnailSrc: (photo: Photo) => string
    createThumbnail: (sectionId: PhotoSectionId, photo: Photo) => CancelablePromise<string>
    showPhotoDetails(sectionId: PhotoSectionId, photoId: PhotoId): void
}

interface State {
    thumbnailSrc: string | null
    // We hide buttons using the `isHovered` state instead of a CSS rule, so the markup stays thin for most of the pictures.
    isHovered: boolean
    isThumbnailLoaded: boolean
    thumbnailError: 'master-missing' | 'create-failed' | 'load-failed' | null
}

export default class Picture extends React.Component<Props, State> {

    private mainRef: React.RefObject<HTMLDivElement>
    private createThumbnailPromise: CancelablePromise<void> | null = null
    private delayedUpdateTimout: number | null = null

    constructor(props: Props) {
        super(props)
        bindMany(this, 'onMouseEnter', 'onMouseLeave', 'onToggleSelection', 'onSetPhotoActive', 'onShowDetails',
            'onThumnailChange', 'onThumbnailLoad', 'onThumbnailLoadError')

        this.state = {
            thumbnailSrc: this.props.getThumbnailSrc(props.photo),
            isHovered: false,
            isThumbnailLoaded: false,
            thumbnailError: null,
        }
        this.mainRef = React.createRef()
    }

    componentDidMount() {
        window.addEventListener('edit:thumnailChange', this.onThumnailChange)
    }

    componentDidUpdate(prevProps: Props, prevState: State) {
        const { props } = this

        if (props.photo.id != prevProps.photo.id) {
            if (this.delayedUpdateTimout) {
                window.clearTimeout(this.delayedUpdateTimout)
            }
            if (this.createThumbnailPromise) {
                this.createThumbnailPromise.cancel()
                this.createThumbnailPromise = null
            }
            this.setState({
                thumbnailSrc: this.props.getThumbnailSrc(this.props.photo),
                isThumbnailLoaded: false,
                thumbnailError: null,
            })
        }

        if (props.isActive && props.isActive !== prevProps.isActive) {
            const mainEl = findDOMNode(this.mainRef.current) as HTMLElement
            const rect = mainEl.getBoundingClientRect()
            let scrollParentElem = mainEl.parentElement
            while (scrollParentElem && scrollParentElem.scrollHeight <= scrollParentElem.clientHeight) {
                scrollParentElem = scrollParentElem.parentElement
            }

            if (scrollParentElem) {
                const scrollParentRect = scrollParentElem.getBoundingClientRect()
                const extraSpacingTop = 10
                const extraSpacingBottom = 10 + toolbarHeight
                if (rect.bottom > scrollParentRect.bottom) {
                    scrollParentElem.scrollTop += rect.bottom - scrollParentRect.bottom + extraSpacingBottom
                } else if (rect.top < scrollParentRect.top) {
                    scrollParentElem.scrollTop += rect.top - scrollParentRect.top - extraSpacingTop
                }
            }
        }
    }

    componentWillUnmount() {
        window.removeEventListener('edit:thumnailChange', this.onThumnailChange)
        if (this.createThumbnailPromise) {
            if (this.delayedUpdateTimout) {
                window.clearTimeout(this.delayedUpdateTimout)
            }
            this.createThumbnailPromise.cancel()
            this.createThumbnailPromise = null
        }
    }

    private onThumnailChange(evt: CustomEvent) {
        const photoId = evt.detail.photoId
        if (photoId === this.props.photo.id) {
            this.createThumbnail(true)
        }
    }

    private onThumbnailLoad() {
        this.setState({ isThumbnailLoaded: true })
    }

    private onThumbnailLoadError() {
        if (!this.createThumbnailPromise) {
            this.createThumbnail(false)
        } else {
            this.setState({ thumbnailError: 'load-failed' })
        }
    }

    private onMouseEnter() {
        const { props } = this
        this.setState({ isHovered: true })
        props.librarySelectionController.setHoverPhoto({ sectionId: props.sectionId, photoId: props.photo.id })
    }

    private onMouseLeave() {
        const { props } = this
        this.setState({ isHovered: false })
        props.librarySelectionController.setHoverPhoto(null)
    }

    private onToggleSelection(event: React.MouseEvent) {
        const { props } = this
        event.stopPropagation()
        event.preventDefault()
        if (props.preselected !== undefined) {
            props.librarySelectionController.applyPreselection()
        } else {
            props.librarySelectionController.setPhotoSelected(props.sectionId, props.photo.id, !props.isSelected)
        }
    }

    private onSetPhotoActive(event: React.MouseEvent) {
        const { props } = this
        event.stopPropagation()
        event.preventDefault()
        if (!props.isActive) {
            props.librarySelectionController.setActivePhoto({
                sectionId: props.sectionId,
                photoId: props.photo.id
            })
        }
    }

    private onShowDetails(event: React.MouseEvent) {
        const { props } = this
        event.stopPropagation()
        event.preventDefault()
        props.showPhotoDetails(props.sectionId, props.photo.id)
    }

    private createThumbnail(delayUpdate: boolean) {
        if (this.delayedUpdateTimout) {
            window.clearTimeout(this.delayedUpdateTimout)
        }
        if (delayUpdate) {
            this.delayedUpdateTimout = window.setTimeout(() => this.setState({ thumbnailSrc: null, isThumbnailLoaded: false }), 1000)
        } else {
            this.setState({ thumbnailSrc: null, isThumbnailLoaded: false })
        }

        this.createThumbnailPromise = this.props.createThumbnail(this.props.sectionId, this.props.photo)
            .then(thumbnailSrc => {
                if (this.delayedUpdateTimout) {
                    window.clearTimeout(this.delayedUpdateTimout)
                }
                if (thumbnailSrc === this.state.thumbnailSrc) {
                    // Force loading the same image again
                    this.setState({ thumbnailSrc: null, isThumbnailLoaded: false })
                    window.setTimeout(() => this.setState({ thumbnailSrc }))
                } else {
                    this.setState({ thumbnailSrc, isThumbnailLoaded: false })
                }
            })
            .catch(error => {
                if (!isCancelError(error)) {
                    const errorCode = getErrorCode(error)
                    const isMasterMissing = errorCode === 'master-missing'
                    if (!isMasterMissing) {
                        console.error('Getting thumbnail failed', error)
                    }
                    this.setState({ thumbnailError: isMasterMissing ? 'master-missing' : 'create-failed' })
                }
            })
    }

    private renderThumbnailError() {
        const isSmall = this.props.layoutBox.height < 150
        const { thumbnailError } = this.state
        const isMasterMissing = thumbnailError === 'master-missing'
        return (
            <div className={classNames('Picture-error', { isSmall })}>
                <Icon
                    icon={isMasterMissing ? 'delete' : 'disable'}
                    iconSize={isSmall ? 20 : 40}
                />
                <div>{msg(isMasterMissing ? 'common_error_photoNotExisting' : 'Picture_error_createThumbnail')}</div>
            </div>
        )
    }

    render() {
        // Wanted behaviour:
        // - If the photo changes, the thumbnail should load fast, so no spinner should be shown.
        // - If there is no thumbnail yet, we trigger creating the thumbnail and show a spinner.
        // - If the favorite state (photo.flag) changes, the thumbnail should not flicker.
        // - If the photo is changed (e.g. rotated), the old thumbnail should stay until the new one is created.
        //   Only if creating the thumbnail takes a long time, a spinner should be shown.

        const { props, state } = this
        const showFavorite = !!(props.photo.flag && state.isThumbnailLoaded)
        const layoutBox = props.layoutBox
        const hasSelectionBorder = props.isSelected && props.inSelectionMode

        return (
            <div
                ref={this.mainRef}
                className={classNames(props.className, 'Picture',
                    { isLoading: !state.isThumbnailLoaded, hasSelectionBorder }
                )}
                style={{
                    left:   Math.round(layoutBox.left),
                    top:    Math.round(layoutBox.top),
                    width:  Math.round(layoutBox.width),
                    height: Math.round(layoutBox.height)
                }}
                onMouseEnter={this.onMouseEnter}
                onMouseLeave={this.onMouseLeave}
                onClick={props.inSelectionMode ? this.onToggleSelection : this.onSetPhotoActive}
                onDoubleClick={props.inSelectionMode ? undefined : this.onShowDetails}
            >
                {state.thumbnailSrc &&
                    <img
                        className='Picture-thumbnail'
                        src={state.thumbnailSrc}
                        onLoad={this.onThumbnailLoad}
                        onError={this.onThumbnailLoadError}
                    />
                }
                {state.thumbnailError &&
                    this.renderThumbnailError()
                }
                {showFavorite &&
                    <div className='Picture-overlay Picture-favorite'>
                        <Icon iconSize={18} icon='star'/>
                    </div>
                }
                {state.isHovered && props.preselected === undefined &&
                    <Button className='Picture-overlay Picture-showDetails'
                        icon={<Icon iconSize={18} icon='zoom-in'/>}
                        minimal={true}
                        title={formatCommandLabel(msg('Picture_showDetails'), showDetailsCombo)}
                        onClick={this.onShowDetails}
                    />
                }
                {(props.inSelectionMode || state.isHovered || props.preselected !== undefined) &&
                    <Button className={classNames('Picture-overlay Picture-toggleSelection')}
                        minimal={true}
                        icon={renderToggleSelectionIcon(props.isSelected, props.inSelectionMode, props.preselected)}
                        title={formatCommandLabel(msg(((props.preselected !== null) ? !props.preselected : props.isSelected) ? 'Picture_select' : 'Picture_deselect'), toggleSelectedCombo)}
                        onClick={this.onToggleSelection}
                    />
                }
                {(props.isActive || props.preselected !== undefined) &&
                    <div className={props.isActive ? 'Picture-activeBorder' : 'Picture-preselectedBorder'}/>
                }
            </div>
        )
    }
}


function renderToggleSelectionIcon(isSelected: boolean, inSelectionMode: boolean, preselected?: boolean): JSX.Element {
    if (inSelectionMode && isSelected && preselected !== false) {
        return (
            <RedCheckCircle className='Picture-icon' size={selectionButtonSize}/>
        )
    } else {
        const Icon = (!inSelectionMode || (isSelected && preselected !== false) || preselected) ? FaCheckCircle : FaRegCircle
        return (
            <Icon className='Picture-icon'/>
        )
    }
}
