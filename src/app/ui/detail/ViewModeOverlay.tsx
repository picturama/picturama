import React from 'react'
import { findDOMNode } from 'react-dom'
import classnames from 'classnames'

import { CameraMetrics, PhotoPosition, maxZoom, RequestedPhotoPosition, limitPhotoPosition } from 'common/util/CameraMetrics'
import { bindMany, isShallowEqual } from 'common/util/LangUtil'

import DragDropController from 'app/util/DragDropController'
import { Point } from 'common/util/GeometryTypes'

import './ViewModeOverlay.less'


export interface Props {
    className?: any
    cameraMetrics: CameraMetrics | null
    setPhotoPosition(photoPosition: RequestedPhotoPosition): void
}

interface State {
    dragStart: { x: number, y: number, photoPosition: PhotoPosition } | null
}

export default class ViewModeOverlay extends React.Component<Props, State> {

    private dragDropController: DragDropController

    constructor(props: Props) {
        super(props)
        bindMany(this, 'onWheel')
        this.state = { dragStart: null }

        this.dragDropController = new DragDropController({
            onDragStart: (point: Point) => {
                const { cameraMetrics } = this.props
                if (this.state.dragStart || !cameraMetrics || cameraMetrics.requestedPhotoPosition === 'contain') {
                    return
                }
        
                const dragStart = { ...point, photoPosition: cameraMetrics.photoPosition }
                this.setState({ dragStart })
            },
            onDrag: (point: Point, isFinished: boolean) => {
                const { dragStart } = this.state
                const { cameraMetrics } = this.props
                if (dragStart && cameraMetrics) {
                    const startPhotoPosition = dragStart.photoPosition
                    const zoom = startPhotoPosition.zoom
        
                    let centerX = startPhotoPosition.centerX - (point.x - dragStart.x) / cameraMetrics.displayScaling / zoom
                    let centerY = startPhotoPosition.centerY - (point.y - dragStart.y) / cameraMetrics.displayScaling / zoom
                    const nextPhotoPosition = limitPhotoPosition(cameraMetrics, { centerX, centerY, zoom }, true)
        
                    if (!isShallowEqual(nextPhotoPosition, cameraMetrics.photoPosition)) {
                        this.props.setPhotoPosition(nextPhotoPosition)
                    }
                }

                if (isFinished) {
                    this.setState({ dragStart: null })
                }
            }
        })
    }

    componentWillUnmount() {
        this.dragDropController.cancel()
    }

    private onWheel(event: React.WheelEvent<HTMLDivElement>) {
        const { cameraMetrics } = this.props
        if (!cameraMetrics) {
            return
        }

        const { photoPosition } = cameraMetrics
        const zoom = Math.min(maxZoom, photoPosition.zoom * Math.pow(1.01, -event.deltaY))
            // One wheel tick has a deltaY of ~ 4
        if (zoom === photoPosition.zoom) {
            // Nothing to do
        } else if (zoom < cameraMetrics.minZoom) {
            this.props.setPhotoPosition('contain')
        } else {
            const mainElem = findDOMNode(this.refs.main) as HTMLDivElement
            const mainRect = mainElem.getBoundingClientRect()

            // The mouse position in the canvas (in device pixels, relative to the center of the canvas)
            const mouseX = event.clientX - mainRect.left - mainRect.width / 2
            const mouseY = event.clientY - mainRect.top - mainRect.height / 2

            // The photo pixel where the mouse is aiming relative (in photo pixels, relative to the top/left corner of the photo)
            const mousePhotoX = photoPosition.centerX + mouseX / cameraMetrics.displayScaling / photoPosition.zoom
            const mousePhotoY = photoPosition.centerY + mouseY / cameraMetrics.displayScaling / photoPosition.zoom

            // The new center (in photo pixels)
            const centerX = mousePhotoX - mouseX / cameraMetrics.displayScaling / zoom
            const centerY = mousePhotoY - mouseY / cameraMetrics.displayScaling / zoom

            this.props.setPhotoPosition({ centerX, centerY, zoom })
        }
    }

    render() {
        const { props, state } = this
        const requestedPhotoPosition = props.cameraMetrics && props.cameraMetrics.requestedPhotoPosition
        const isZoomed = requestedPhotoPosition && requestedPhotoPosition !== 'contain'
        return (
            <div
                ref='main'
                className={classnames(props.className, 'ViewModeOverlay', { isZoomed, isDragging: state.dragStart })}
                onMouseDown={this.dragDropController.onMouseDown}
                onWheel={this.onWheel}
            />
        )
    }

}
