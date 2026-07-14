import { Size } from 'app/util/GeometryTypes'


let scrollbarSize: Size | null = null

export function getScrollbarSize(): Size {
    if (!scrollbarSize) {
        const body = document.body

        const div = document.createElement('div')
        div.style.width = div.style.height = '100px'
        div.style.overflow = 'scroll'
        div.style.position = 'absolute'
        body.appendChild(div)

        scrollbarSize = {
            width: div.offsetWidth - div.clientWidth,
            height: div.offsetHeight - div.clientHeight
        }

        body.removeChild(div)
    }

    return scrollbarSize
}
