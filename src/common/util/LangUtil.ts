export function round(value: number, fractionDigits: number = 0) {
    if (fractionDigits <= 0) {
        return Math.round(value)
    } else {
        return parseFloat(value.toFixed(fractionDigits))
    }
}


export function bindMany(object: object, ...keys: string[]) {
    for (const key of keys) {
        const value = object[key]
        if (typeof value === 'function') {
            object[key] = value.bind(object)
        } else {
            throw new Error(`bindMany failed: '${key}' is no function`)
        }
    }
}


/**
 * Checks whether two objects are shallow equal: For objects (maps) and arrays, the first level of values is checked, other types
 * are compared using `==`.
 *
 * @param obj1 the first object
 * @param obj2 the second object
 * @return whether the two objects are shallow-equal
 */
export function isShallowEqual(obj1: any, obj2: any): boolean {
    if (obj1 == obj2) {
        return true
    } else if (Array.isArray(obj1) && Array.isArray(obj2)) {
        if (obj1.length !== obj2.length) {
            return false
        }

        for (let i = 0, il = obj1.length; i < il; i++) {
            if (obj1[i] != obj2[i]) {
                return false
            }
        }

        return true
    } else if (isObject(obj1) && isObject(obj2)) {
        const keys1 = Object.keys(obj1),
              keys2 = Object.keys(obj2)

        if (keys1.length != keys2.length) {
            return false
        }

        keys1.sort()
        keys2.sort()
        for (let i = 0, il = keys1.length; i < il; i++) {
            if (keys1[i] != keys2[i]) {
                return false
            }
        }

        for (let key of keys1) {
            if (obj1[key] != obj2[key]) {
                return false
            }
        }

        return true
    } else {
        return false
    }
}


export function isArray(value: any): value is any[] {
    return Array.isArray(value)
}


/**
 * Returns whether a value is a plain JavaScript object.
 *
 * NOTE: Using `typeof` isn't sufficient in many cases, since typeof returns `'object'` for many unexpected values
 *       like `null`, `[]` or `new Date()`.
 *
 * @param value the value to check
 * @return whether the value is a plain JavaScript object
 */
export function isObject(value: any): value is object {
    // Details see: https://toddmotto.com/understanding-javascript-types-and-reliable-type-checking/
    return Object.prototype.toString.call(value) === '[object Object]'
}


export function cloneDeep<T>(object: T): T {
    return JSON.parse(JSON.stringify(object)) as T
}

/**
 * Clones an array while removing one item.
 * 
 * If the array doesn't contain the item, the original array is returned (without cloning)
 * 
 * @param array the array where to remove the item
 * @param itemToRemove the item to remove
 * @param comparationAttribute the attribute to compare for finding the item to remove
 * @return the cloned array without `itemToRemove` or the original array if it doesn't contain `itemToRemove`
 */
export function cloneArrayWithItemRemoved<T, K extends keyof T>(array: T[], itemToRemove: T, comparationAttribute: K | null = null): T[] {
    let itemIndex: number
    if (comparationAttribute) {
        itemIndex = -1
        const attributeValueToRemove = itemToRemove[comparationAttribute]
        for (let i = 0, il = array.length; i < il; i++) {
            if (array[i][comparationAttribute] === attributeValueToRemove) {
                itemIndex = i
                break
            }
        }
    } else {
        itemIndex = array.indexOf(itemToRemove)
    }

    if (itemIndex === -1) {
        return array
    } else {
        return [
            ...array.slice(0, itemIndex),
            ...array.slice(itemIndex + 1)
        ]
    }
}


export function slug(text: string): string {
    return text.toLowerCase()
        .replace(/[^\w ]+/g, '')
        .replace(/ +/g, '-')
}


export function getErrorCode(error: any): string | undefined {
    if (error && typeof error['errorCode'] === 'string') {
        return error['errorCode']
    }
}


export function addErrorCode(error: Error, errorCode: string): Error {
    error['errorCode'] = errorCode
    return error
}
