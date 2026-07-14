import React from 'react'
import { findDOMNode } from 'react-dom'
import classnames from 'classnames'

import DragDropController from 'app/util/DragDropController'
import { Point } from 'app/util/GeometryTypes'
import { round } from 'app/util/LangUtil'

import './TiltControl.less'


const mainHeight = 350
const mainWidth = 50
const fadeHeight = 30
const tickSpacing = 6
const tickHeight = 2
const majorTickDegrees = 5
const originTickWidth = 20
const originTickX = -5
const originSnapMargin = 16
const majorTickWidth = 10
const majorTickX = 0
const minorTickWidth = tickHeight
const minorTickX = majorTickX + (majorTickWidth - minorTickWidth) / 2
const arrowMargin = 5
const arrowX = majorTickWidth + arrowMargin
const arrowWidth = 6
const arrowHeight = 6
const labelX = arrowX + arrowWidth + arrowMargin

const arrowPath = `M${arrowX},0 l${arrowWidth},${-arrowHeight/2} l0,${arrowHeight}`

const maxDegrees = 45


export interface Props {
    className?: any
    x: number
    centerY: number
    tilt: number
    onTiltChange(tilt: number, isFinished: boolean): void
}

export default class TiltControl extends React.Component<Props> {

    private dragDropController: DragDropController
    /** The distance of the cursor to the origin (in pixels) */
    private dragOriginDistance = 0

    constructor(props: Props) {
        super(props)
        this.state = {}
        this.dragDropController = new DragDropController({
            onDragStart: (point: Point, event: React.MouseEvent) => {
                const { tilt } = this.props

                let scaleY = tilt * tickSpacing
                if (scaleY < 0) {
                    scaleY -= originSnapMargin
                } else if (scaleY > 0) {
                    scaleY += originSnapMargin
                }

                this.dragOriginDistance = point.y - scaleY

                this.props.onTiltChange(tilt, false)
            },
            onDrag: (point: Point, isFinished: boolean, event: MouseEvent) => {
                const { dragOriginDistance } = this
                let scaleY = (point.y - dragOriginDistance)

                if (scaleY < -originSnapMargin) {
                    scaleY += originSnapMargin
                } else if (scaleY > originSnapMargin) {
                    scaleY -= originSnapMargin
                } else {
                    scaleY = 0
                }

                const tilt = Math.max(-maxDegrees, Math.min(maxDegrees, round(scaleY / tickSpacing, 1)))

                this.props.onTiltChange(tilt, isFinished)
            }
        })
    }

    componentDidMount() {
        const mainElem = findDOMNode(this.refs.main) as SVGElement
        this.dragDropController.setContainerElem(mainElem)
    }

    private renderTick(degree: number, originY: number): JSX.Element {
        let className: string
        let x: number
        let width: number
        const height = tickHeight
        if (degree === 0) {
            className = 'TiltControl-tickOrigin'
            x = originTickX
            width = originTickWidth
        } else if (degree % majorTickDegrees === 0) {
            className = 'TiltControl-tickMajor'
            x = majorTickX
            width = majorTickWidth
        } else {
            className = 'TiltControl-tickMinor'
            x = minorTickX
            width = minorTickWidth
        }

        if (Math.abs(degree) > maxDegrees) {
            className += ' isDisabled'
        }

        const y = originY - degree * tickSpacing
        const opacity = (mainHeight / 2 - Math.abs(y)) / fadeHeight
        const style = (opacity < 1) ? { opacity } : undefined

        return (
            <rect key={degree} className={className} style={style} x={x} y={y - height / 2} width={width} height={height} />
        )
    }

    render() {
        const { props } = this

        const originY = this.props.tilt * tickSpacing
        const fromDegree = Math.ceil((originY - mainHeight / 2) / tickSpacing)
        const toDegree = Math.floor((originY + mainHeight / 2) / tickSpacing)
        const ticks: any[] = []
        for (let degree = fromDegree; degree <= toDegree; degree++) {
            ticks.push(this.renderTick(degree, originY))
        }        

        return (
            <g
                ref='main'
                className={classnames(props.className, 'TiltControl')}
                transform={`translate(${props.x},${props.centerY})`}
            >
                {ticks}
                <path className='TiltControl-arrow' d={arrowPath} />
                <text className='TiltControl-label' x={labelX} y={0} dy='0.35em'>
                    {`${Math.round(props.tilt)}°`}
                </text>
                <rect
                    className='TiltControl-handle'
                    x={0}
                    y={-mainHeight / 2}
                    width={mainWidth}
                    height={mainHeight}
                    onMouseDown={this.dragDropController.onMouseDown}
                />
            </g>
        )
    }

}
