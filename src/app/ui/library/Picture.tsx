import classNames from 'classnames'
import React from 'react'
import { findDOMNode } from 'react-dom'
import { Icon } from '@blueprintjs/core'

import { msg } from 'common/i18n/i18n'
import CancelablePromise, { isCancelError } from 'common/util/CancelablePromise'
import { bindMany, getErrorCode } from 'common/util/LangUtil'
import { PhotoId, Photo, PhotoSectionId } from 'common/CommonTypes'

import { JustifiedLayoutBox } from 'app/UITypes'
import FaIcon from 'app/ui/widget/icon/FaIcon'

import './Picture.less'


export interface Props {
    className?: any
    sectionId: PhotoSectionId
    photo: Photo
    layoutBox: JustifiedLayoutBox
    isHighlighted: boolean
    getThumbnailSrc: (photo: Photo) => string
    createThumbnail: (sectionId: PhotoSectionId, photo: Photo) => CancelablePromise<string>
    onPhotoClick: (event: React.MouseEvent, sectionId: PhotoSectionId, photoId: PhotoId) => void
    onPhotoDoubleClick: (event: React.MouseEvent, sectionId: PhotoSectionId, photoId: PhotoId) => void
}

interface State {
    thumbnailSrc: string | null
    isThumbnailLoaded: boolean
    thumbnailError: 'master-missing' | 'create-failed' | 'load-failed' | null
}

export default class Picture extends React.Component<Props, State> {

    private createThumbnailPromise: CancelablePromise<void> | null = null
    private delayedUpdateTimout: number | null = null

    constructor(props: Props) {
        super(props)

        this.state = {
            thumbnailSrc: this.props.getThumbnailSrc(props.photo),
            isThumbnailLoaded: false,
            thumbnailError: null,
        }

        bindMany(this, 'onClick', 'onDoubleClick', 'onThumnailChange', 'onThumbnailLoad', 'onThumbnailLoadError')
    }

    componentDidMount() {
        window.addEventListener('edit:thumnailChange', this.onThumnailChange)
    }

    componentDidUpdate(prevProps: Props, prevState: State) {
        const props = this.props

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

        if (props.isHighlighted && props.isHighlighted !== prevProps.isHighlighted) {
            const pictureElem = findDOMNode(this.refs.picture) as HTMLElement
            const rect = pictureElem.getBoundingClientRect()
            let scrollParentElem = pictureElem.parentElement
            while (scrollParentElem && scrollParentElem.scrollHeight <= scrollParentElem.clientHeight) {
                scrollParentElem = scrollParentElem.parentElement
            }

            if (scrollParentElem) {
                const scrollParentRect = scrollParentElem.getBoundingClientRect()
                const extraSpacing = 10
                if (rect.bottom > scrollParentRect.bottom) {
                    scrollParentElem.scrollTop += rect.bottom - scrollParentRect.bottom + extraSpacing
                } else if (rect.top < scrollParentRect.top) {
                    scrollParentElem.scrollTop += rect.top - scrollParentRect.top - extraSpacing
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

    onThumnailChange(evt: CustomEvent) {
        const photoId = evt.detail.photoId
        if (photoId === this.props.photo.id) {
            this.createThumbnail(true)
        }
    }

    onThumbnailLoad() {
        this.setState({ isThumbnailLoaded: true })
    }

    onThumbnailLoadError() {
        if (!this.createThumbnailPromise) {
            this.createThumbnail(false)
        } else {
            this.setState({ thumbnailError: 'load-failed' })
        }
    }

    onClick(event: React.MouseEvent) {
        const props = this.props
        props.onPhotoClick(event, props.sectionId, props.photo.id)
    }

    onDoubleClick(event: React.MouseEvent) {
        const props = this.props
        props.onPhotoDoubleClick(event, props.sectionId, props.photo.id)
    }

    createThumbnail(delayUpdate: boolean) {
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

    renderThumbnailError() {
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
        // - If the flagged state changes, the thumbnail should not flicker.
        // - If the photo is changed (e.g. rotated), the old thumbnail should stay until the new one is created.
        //   Only if creating the thumbnail takes a long time, a spinner should be shown.

        const props = this.props
        const state = this.state
        const showFlag = !!(props.photo.flag && state.isThumbnailLoaded)
        const layoutBox = props.layoutBox

        return (
            <div
                ref="picture"
                className={classNames(props.className, 'Picture', { isHighlighted: props.isHighlighted, isLoading: !state.isThumbnailLoaded })}
                style={{
                    left:   Math.round(layoutBox.left),
                    top:    Math.round(layoutBox.top),
                    width:  Math.round(layoutBox.width),
                    height: Math.round(layoutBox.height)
                }}
                onClick={this.onClick}
                onDoubleClick={this.onDoubleClick}>
                {state.thumbnailSrc &&
                    <img
                        ref="image"
                        className="Picture-thumbnail"
                        width={layoutBox.width}
                        height={layoutBox.height}
                        src={state.thumbnailSrc}
                        onLoad={this.onThumbnailLoad}
                        onError={this.onThumbnailLoadError}
                    />
                }
                {showFlag &&
                    <FaIcon ref="flag" className="Picture-flag" name="flag"/>
                }
                {state.thumbnailError &&
                    this.renderThumbnailError()
                }
            </div>
        )
    }
}
