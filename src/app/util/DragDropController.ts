import { Point } from 'app/util/GeometryTypes'
import { bindMany } from 'app/util/LangUtil'


export interface DragDropControllerOptions {
    /**
     * The element to which `x` and `y` in events should be relative.
     * If not set, `x` and `y` are relative to the body.
     */
    containerElem?: HTMLElement | SVGElement
    onDragStart(point: Point, event: React.MouseEvent): void
    onDrag(point: Point, isFinished: boolean, event: MouseEvent): void
    onDragCancel?: () => void
}

export default class DragDropController {

    private isDragging = false

    constructor(private options: DragDropControllerOptions) {
        bindMany(this, 'onMouseDown', 'onMouseMove', 'onMouseUp')
    }

    setContainerElem(containerElem: HTMLElement | SVGElement): this {
        this.options = { ...this.options, containerElem }
        return this
    }

    cancel() {
        if (this.isDragging) {
            this.removeDragListeners()

            const onDragCancel = this.options.onDragCancel
            if (onDragCancel) {
                onDragCancel()
            }
        }
    }

    onMouseDown(event: React.MouseEvent) {
        if (this.isDragging) {
            return
        }

        event.preventDefault()

        this.isDragging = true
        window.addEventListener('mousemove', this.onMouseMove)
        window.addEventListener('mouseup', this.onMouseUp)

        this.options.onDragStart(this.getPointFromEvent(event), event)
    }

    private removeDragListeners() {
        window.removeEventListener('mousemove', this.onMouseMove)
        window.removeEventListener('mouseup', this.onMouseUp)
        this.isDragging = false
    }

    private onMouseMove(event: MouseEvent) {
        this.options.onDrag(this.getPointFromEvent(event), false, event)
    }

    private onMouseUp(event: MouseEvent) {
        this.removeDragListeners()
        this.options.onDrag(this.getPointFromEvent(event), true, event)
    }

    private getPointFromEvent(event: React.MouseEvent | MouseEvent): Point {
        let x = event.clientX
        let y = event.clientY

        const containerElem = this.options.containerElem
        if (containerElem) {
            const containerRect = containerElem.getBoundingClientRect()
            x -= containerRect.left
            y -= containerRect.top
        }

        return { x, y }
    }

}
