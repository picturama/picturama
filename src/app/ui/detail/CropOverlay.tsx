import React from 'react'
import { findDOMNode } from 'react-dom'
import classnames from 'classnames'

import { bindMany } from 'common/util/LangUtil'

import DragDropController from 'app/util/DragDropController'
import { Rect, Point, Corner, corners, Side, sides } from 'common/util/GeometryTypes'

import TiltControl from './TiltControl'

import './CropOverlay.less'


const borderWidth = 1
const hintStrokeWidth = 1
const cornerWidth = 3
const cornerSize = 20
const tiltControlMargin = 20
const minTiltHintGap = 50

const halfHandleSize = 16

const cornerPaths: { [K in Corner]: string } = {
    nw: `m${-cornerWidth/2},${cornerSize - cornerWidth/2} l0,${-cornerSize} l${cornerSize},0`,
    ne: `m${-cornerSize + cornerWidth/2},${-cornerWidth/2} l${cornerSize},0 l0,${cornerSize}`,
    sw: `m${-cornerWidth/2},${-cornerSize + cornerWidth/2} l0,${cornerSize} l${cornerSize},0`,
    se: `m${-cornerSize + cornerWidth/2},${cornerWidth/2} l${cornerSize},0 l0,${-cornerSize}`,
}

type DragInfo =
    { type: 'rect', startPoint: Point } |
    { type: 'side', side: Side, anchor: Point } |
    { type: 'corner', corner: Corner, anchor: Point } |
    null

export interface Props {
    className?: any
    width: number
    height: number
    rect: Rect
    tilt: number
    onRectDrag(deltaX: number, deltaY: number, isFinished: boolean): void
    onSideDrag(side: Side, point: Point, isFinished: boolean): void
    onCornerDrag(corner: Corner, point: Point, isFinished: boolean): void
    onTiltChange(tilt: number): void
}

interface State {
    dragInfo: DragInfo
    isTilting: boolean
}

export default class CropOverlay extends React.Component<Props, State> {

    private rectDragDropController: DragDropController
    private sideOrCornerDragDropController: DragDropController

    constructor(props: Props) {
        super(props)
        bindMany(this, 'onTiltChange', 'renderSide', 'renderCorner')
        this.state = { dragInfo: null, isTilting: false }

        this.rectDragDropController = new DragDropController({
            onDragStart: (point: Point, event: React.MouseEvent) => {
                this.setState({ dragInfo: { type: 'rect', startPoint: point } })
            },
            onDrag: (point: Point, isFinished: boolean, event: MouseEvent) => {
                const { dragInfo } = this.state
                if (dragInfo && dragInfo.type === 'rect') {
                    const deltaX = point.x - dragInfo.startPoint.x
                    const deltaY = point.y - dragInfo.startPoint.y
                    this.props.onRectDrag(deltaX, deltaY, isFinished)
                }
                if (isFinished) {
                    this.setState({ dragInfo: null })
                }
            }
        })

        this.sideOrCornerDragDropController = new DragDropController({
            onDragStart: (point: Point, event: React.MouseEvent) => {
                const targetElem = event.target as SVGElement
                const targetRect = targetElem.getBoundingClientRect()
                const anchor: Point = {
                    x: event.clientX - targetRect.left - halfHandleSize,
                    y: event.clientY - targetRect.top - halfHandleSize,
                }
                let dragInfo: DragInfo
                const side = targetElem.dataset.side as Side | undefined
                if (side) {
                    dragInfo = { type: 'side', side, anchor }
                } else {
                    const corner = targetElem.dataset.corner as Corner
                    dragInfo = { type: 'corner', corner, anchor }
                }
                this.setState({ dragInfo })
            },
            onDrag: (point: Point, isFinished: boolean, event: MouseEvent) => {
                const { dragInfo } = this.state
                if (dragInfo && (dragInfo.type === 'side' || dragInfo.type === 'corner')) {
                    const targetPoint = {
                        x: point.x - dragInfo.anchor.x,
                        y: point.y - dragInfo.anchor.y,
                    }
                    if (dragInfo.type === 'side') {
                        this.props.onSideDrag(dragInfo.side, targetPoint, isFinished)
                    } else {
                        this.props.onCornerDrag(dragInfo.corner, targetPoint, isFinished)
                    }
                }
                if (isFinished) {
                    this.setState({ dragInfo: null })
                }
            }
        })
    }

    componentDidMount() {
        const mainElem = findDOMNode(this.refs.main) as SVGElement
        this.rectDragDropController.setContainerElem(mainElem)
        this.sideOrCornerDragDropController.setContainerElem(mainElem)
    }

    private onTiltChange(tilt: number, isFinished: boolean) {
        this.props.onTiltChange(tilt)

        const isTilting = !isFinished
        if (isTilting !== this.state.isTilting) {
            this.setState({ isTilting })
        }
    }

    private renderHintLines(xPartCount: number, yPartCount: number) {
        const { rect } = this.props

        let pathParts: string[] = []
        for (let xPart = 1; xPart < xPartCount; xPart++) {
            const x = Math.round(rect.x + rect.width * xPart / xPartCount)
            pathParts.push(`M${x - hintStrokeWidth / 2},${rect.y} l0,${rect.height}`)
        }
        for (let yPart = 1; yPart < yPartCount; yPart++) {
            const y = Math.round(rect.y + rect.height * yPart / yPartCount)
            pathParts.push(`M${rect.x},${y - hintStrokeWidth / 2} l${rect.width},0`)
        }

        return (
            <path
                className='CropOverlay-hint'
                d={pathParts.join(' ')}
                strokeWidth={hintStrokeWidth}
            />
        )
    }

    private renderSide(side: Side) {
        const { rect } = this.props

        const width = (side === 'n' || side === 's') ? rect.width - 2 * halfHandleSize : 2 * halfHandleSize
        const height = (side === 'w' || side === 'e') ? rect.height - 2 * halfHandleSize : 2 * halfHandleSize

        if (width <= 0 || height <= 0) {
            return null
        }

        return (
            <rect
                key={side}
                data-side={side}
                className='CropOverlay-sideHandle'
                style={{ cursor: (side === 'n' || side === 's') ? 'ns-resize' : 'ew-resize' }}
                x={rect.x + (side === 'w' ? -halfHandleSize : side === 'e' ? rect.width - halfHandleSize : halfHandleSize)}
                y={rect.y + (side === 'n' ? -halfHandleSize : side === 's' ? rect.height - halfHandleSize : halfHandleSize)}
                width={width}
                height={height}
                onMouseDown={this.sideOrCornerDragDropController.onMouseDown}
            />
        )
    }

    private renderCorner(corner: Corner) {
        const { rect } = this.props

        let cursor: string
        let transform: string
        switch (corner) {
            case 'nw': cursor = 'nwse-resize'; transform = `translate(${rect.x},${rect.y})`; break
            case 'ne': cursor = 'nesw-resize'; transform = `translate(${rect.x + rect.width},${rect.y})`; break
            case 'sw': cursor = 'nesw-resize'; transform = `translate(${rect.x},${rect.y + rect.height})`; break
            case 'se': cursor = 'nwse-resize'; transform = `translate(${rect.x + rect.width},${rect.y + rect.height})`; break
            default: throw new Error('Unepected corner: ' + corner)
        }

        return (
            <g key={corner} transform={transform}>
                <path className='CropOverlay-corner' strokeWidth={cornerWidth} d={cornerPaths[corner]} />
                <rect
                    data-corner={corner}
                    className='CropOverlay-cornerHandle'
                    style={{ cursor }}
                    x={-halfHandleSize}
                    y={-halfHandleSize}
                    width={2 * halfHandleSize}
                    height={2 * halfHandleSize}
                    onMouseDown={this.sideOrCornerDragDropController.onMouseDown}
                />
            </g>
        )
    }

    render() {
        const { props, state } = this
        const { rect } = props
        const { dragInfo } = state

        let width = Math.max(0, props.width)
        let height = Math.max(0, props.height)

        return (
            <svg
                ref='main'
                className={classnames(props.className, 'CropOverlay', {
                    isChanging: state.isTilting || state.dragInfo,
                    isDraggingRect: dragInfo && dragInfo.type === 'rect'
                })}
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
            >
                <path
                    className='CropOverlay-dim'
                    fillRule='evenodd'
                    d={`M0,0 l${width},0 l0,${height} l${-width},0 z M${rect.x},${rect.y} l0,${rect.height} l${rect.width},0 l0,${-rect.height} z`}
                />
                {state.dragInfo &&
                    this.renderHintLines(3, 3)
                }
                {state.isTilting &&
                    this.renderHintLines(Math.floor(rect.width / minTiltHintGap), Math.floor(rect.height / minTiltHintGap))
                }
                <rect
                    className='CropOverlay-rect'
                    x={rect.x - borderWidth / 2}
                    y={rect.y - borderWidth / 2}
                    width={rect.width + borderWidth}
                    height={rect.height + borderWidth}
                    strokeWidth={borderWidth}
                    onMouseDown={this.rectDragDropController.onMouseDown}
                />
                {sides.map(this.renderSide)}
                {corners.map(this.renderCorner)}
                {!state.dragInfo &&
                    <TiltControl
                        x={rect.x + rect.width + tiltControlMargin}
                        centerY={props.height / 2}
                        tilt={props.tilt}
                        onTiltChange={this.onTiltChange}
                    />
                }
            </svg>
        )
    }

}
