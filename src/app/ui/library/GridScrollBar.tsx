import React from 'react'
import { findDOMNode } from 'react-dom'
import classnames from 'classnames'
import moment = require('moment')

import { PhotoSectionId, PhotoSectionById } from 'common/CommonTypes'
import { bindMany } from 'common/util/LangUtil'

import { GridLayout, GridSectionLayout } from 'app/UITypes'

import './GridScrollBar.less'


interface ScaleItem {
    y: number
    type: 'year' | 'month'
    /** E.g. '2019' for a year or '2019-08' for a month */
    id: string
    /** E.g. '2019' for a year or 'Aug' for a month */
    label: string
}

const minMonthScaleItemGap = 15
const minYearScaleItemGap = 16

let monthLabels: string[] | null = null


export interface Props {
    className?: any
    gridLayout: GridLayout
    sectionIds: PhotoSectionId[]
    sectionById: PhotoSectionById
    viewportHeight: number
    contentHeight: number
    scrollTop: number
    setScrollTop(scrollTop: number): void
}

interface State {
    prevGridLayout: GridLayout | null
    prevViewportHeight: number
    isMouseInside: boolean
    isDragging: boolean
    mouseOverHint: { y: number, label: string }
    scaleItems: ScaleItem[]
}

export default class GridScrollBar extends React.Component<Props, State> {

    constructor(props: Props) {
        super(props)
        this.state = {
            prevGridLayout: null,
            prevViewportHeight: 0,
            isMouseInside: false,
            isDragging: false,
            mouseOverHint: { y: 0, label: '' },
            scaleItems: [],
        }
        bindMany(this, 'onMouseDown', 'onWindowMouseMove', 'onWindowMouseUp', 'onMouseMove', 'onMouseOut', 'onWheel')

        if (!monthLabels) {
            monthLabels = []
            for (let month = 0; month < 12; month++) {
                monthLabels[month] = moment(new Date(2000, month)).format('MMM')
            }
        }
    }

    static getDerivedStateFromProps(nextProps: Props, prevState: State): Partial<State> | null {
        if (nextProps.gridLayout !== prevState.prevGridLayout || nextProps.viewportHeight !== prevState.prevViewportHeight) {
            const scaleItems = generateScaleItems(nextProps.gridLayout.sectionLayouts, nextProps.sectionIds,
                nextProps.sectionById, nextProps.viewportHeight, nextProps.contentHeight)
            return {
                prevGridLayout: nextProps.gridLayout,
                prevViewportHeight: nextProps.viewportHeight,
                scaleItems
            }
        }
        return null
    }

    private onMouseDown(event: React.MouseEvent) {
        const nextState: Partial<State> = { isDragging: true }
        this.moveHint(event.clientY, nextState, true)
        window.addEventListener('mousemove', this.onWindowMouseMove)
        window.addEventListener('mouseup', this.onWindowMouseUp)
        this.setState(nextState as any)
    }

    private onWindowMouseMove(event: MouseEvent) {
        const nextState: Partial<State> = {}
        this.moveHint(event.clientY, nextState, true)
        this.setState(nextState as any)
    }

    private onWindowMouseUp() {
        window.removeEventListener('mousemove', this.onWindowMouseMove)
        window.removeEventListener('mouseup', this.onWindowMouseUp)
        this.setState({ isDragging: false })
    }

    private onMouseMove(event: React.MouseEvent) {
        const nextState: Partial<State> = { isMouseInside: true }
        this.moveHint(event.clientY, nextState)
        this.setState(nextState as any)
    }

    private onMouseOut(event: React.MouseEvent) {
        const mainElem = findDOMNode(this.refs.main) as HTMLDivElement

        let elem: HTMLElement | null = event.relatedTarget as HTMLElement
        while (elem) {
            if (elem === mainElem) {
                // Mouse didn't leave the mainElem
                return
            }
            elem = elem.parentElement
        }

        this.setState({ isMouseInside: false })
    }

    private onWheel(event: React.WheelEvent<HTMLDivElement>) {
        this.props.setScrollTop(this.props.scrollTop + event.deltaY)
    }

    private moveHint(clientY: number, nextState: Partial<State>, scrollToHint?: boolean) {
        const { props, state } = this

        const mainElem = findDOMNode(this.refs.main) as HTMLDivElement
        const mainRect = mainElem.getBoundingClientRect()

        const y = clientY - mainRect.top
        const prevMouseOverHint = state.mouseOverHint
        const contentY = Math.round(props.contentHeight * y / props.viewportHeight)
        if (!prevMouseOverHint || y !== prevMouseOverHint.y) {
            const sectionIndex = getSectionIndexAtY(contentY, props.gridLayout.sectionLayouts)
            const section = (sectionIndex !== null) && props.sectionById[props.sectionIds[sectionIndex]]
            const label = section ? section.title : ''

            nextState.mouseOverHint = { y, label }
        }
        if (scrollToHint) {
            props.setScrollTop(contentY)
        }
    }

    render() {
        const { props, state } = this
        const scrollHeight = Math.max(1, props.viewportHeight, props.contentHeight)
        return (
            <div
                ref='main'
                className={classnames(props.className, 'GridScrollBar')}
                onMouseDown={this.onMouseDown}
                onMouseMove={this.onMouseMove}
                onMouseOut={this.onMouseOut}
                onWheel={this.onWheel}
            >
                <div
                    className='GridScrollBar-thumb'
                    style={{
                        top: Math.round(props.viewportHeight * props.scrollTop / scrollHeight),
                        height: Math.max(4, Math.round(props.viewportHeight * props.viewportHeight / scrollHeight))
                    }}
                />
                {state.scaleItems.map(scaleItem =>
                    <div
                        key={scaleItem.id}
                        data-id={scaleItem.id}
                        className={`GridScrollBar-scaleItem hasType_${scaleItem.type}`}
                        style={{ top: scaleItem.y }}
                    >
                        {scaleItem.label}
                    </div>
                )}
                <div
                    className={classnames('GridScrollBar-hint', { isVisible: state.isMouseInside || state.isDragging })}
                    style={{ top: state.mouseOverHint.y }}
                >
                    <div className={classnames('GridScrollBar-hintLabel', { isBelow: state.mouseOverHint.y < 30 })}>
                        {state.mouseOverHint.label}
                    </div>
                </div>
            </div>
        )
    }

}


function generateScaleItems(sectionLayouts: GridSectionLayout[], sectionIds: PhotoSectionId[], sectionById: PhotoSectionById,
    viewportHeight: number, contentHeight: number): ScaleItem[]
{
    const sectionCount = sectionIds.length

    const result: ScaleItem[] = []
    let prevBottom = Number.NEGATIVE_INFINITY
    let prevItemIsMonth = false
    let prevYear: string | null = null
    let prevMonth: string | null = null
    for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex++) {
        const sectionLayout = sectionLayouts[sectionIndex]
        const y = Math.max(1, Math.round(viewportHeight * sectionLayout.top / contentHeight))
            // Use a min y of 1px, so the very first scale item has a little gap to the top of the scrollbar

        const section = sectionById[sectionIds[sectionIndex]]
        const overlapsLastItem = y < prevBottom

        let year: string
        let isNewYear: boolean
        if (!prevYear || !section.title.startsWith(prevYear)) {
            year = section.title.substr(0, 4)
            isNewYear = true
            prevYear = year
        } else {
            year = prevYear
            isNewYear = false
        }

        if (overlapsLastItem && !(isNewYear && prevItemIsMonth)) {
            continue
        }

        const isNewMonth = !prevMonth || !section.title.startsWith(prevMonth)
        if (!isNewMonth) {
            continue
        }

        const bottom = y + (isNewYear ? minYearScaleItemGap : minMonthScaleItemGap)
        if (bottom > viewportHeight) {
            continue
        }

        // Create a scale item
        const month = section.title.substr(0, 7)
        const scaleItem: ScaleItem = {
            y,
            type: isNewYear ? 'year' : 'month',
            id: isNewYear ? year : month,
            label: isNewYear ? year : monthLabels![parseInt(month.substr(5)) - 1]
        }
        if (overlapsLastItem) {
            result.pop()
        }
        result.push(scaleItem)

        prevBottom = bottom
        prevItemIsMonth = !isNewYear
        prevMonth = month
    }

    return result
}


function getSectionIndexAtY(y: number, sectionLayouts: GridSectionLayout[]): number | null {
    let left = 0
    let right = sectionLayouts.length - 1
    while (left <= right) {
        let center = Math.floor(left + (right - left) / 2)
        const sectionLayout = sectionLayouts[center]
        if (y < sectionLayout.top) {
            right = center - 1
        } else if (y > sectionLayout.top + sectionLayout.height) {
            left = center + 1
        } else {
            return center
        }
    }
    return null
}
