import { mat4 } from 'gl-matrix'

import { PhotoWork } from 'app/CommonTypes'
import { transformRect } from 'app/util/GeometryUtil'


export function rotate(photoWork: PhotoWork, turns: number, adjustCropRect: boolean) {
    const newRotationTurns = ((photoWork.rotationTurns || 0) + turns + 4) % 4
    if (newRotationTurns === 1 || newRotationTurns === 2 || newRotationTurns === 3) {
        photoWork.rotationTurns = newRotationTurns
    } else {
        delete photoWork.rotationTurns
    }

    const { cropRect: prevCropRect } = photoWork
    if (adjustCropRect && prevCropRect) {
        const matrix = mat4.create()
        mat4.rotateZ(matrix, matrix, turns * Math.PI / 2)
        photoWork.cropRect = transformRect(prevCropRect, matrix)
    }
}
