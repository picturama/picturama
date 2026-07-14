type ValueOrPromise<ValueType> = ValueType | Promise<ValueType> | CancelablePromise<ValueType>

type Executor<ValueType> = (
    resolve: (value: ValueOrPromise<ValueType>) => void,
    reject: (error?: any) => void,
    cancel: (taskDesc?: string) => void
) => void

/**
 * A promise having cancel support.
 *
 * @extends Promise
 */
export default class CancelablePromise<ValueType> {

    static all<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(values: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>, T7 | PromiseLike<T7>, T8 | PromiseLike<T8>, T9 | PromiseLike<T9>, T10 | PromiseLike<T10>]): CancelablePromise<[T1, T2, T3, T4, T5, T6, T7, T8, T9, T10]>;
    static all<T1, T2, T3, T4, T5, T6, T7, T8, T9>(values: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>, T7 | PromiseLike<T7>, T8 | PromiseLike<T8>, T9 | PromiseLike<T9>]): CancelablePromise<[T1, T2, T3, T4, T5, T6, T7, T8, T9]>;
    static all<T1, T2, T3, T4, T5, T6, T7, T8>(values: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>, T7 | PromiseLike<T7>, T8 | PromiseLike<T8>]): CancelablePromise<[T1, T2, T3, T4, T5, T6, T7, T8]>;
    static all<T1, T2, T3, T4, T5, T6, T7>(values: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>, T7 | PromiseLike<T7>]): CancelablePromise<[T1, T2, T3, T4, T5, T6, T7]>;
    static all<T1, T2, T3, T4, T5, T6>(values: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>]): CancelablePromise<[T1, T2, T3, T4, T5, T6]>;
    static all<T1, T2, T3, T4, T5>(values: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>, T5 | PromiseLike<T5>]): CancelablePromise<[T1, T2, T3, T4, T5]>;
    static all<T1, T2, T3, T4>(values: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>]): CancelablePromise<[T1, T2, T3, T4]>;
    static all<T1, T2, T3>(values: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>]): CancelablePromise<[T1, T2, T3]>;
    static all<T1, T2>(values: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>]): CancelablePromise<[T1, T2]>;
    static all<T>(values: (T | PromiseLike<T>)[]): CancelablePromise<T[]>;
    static all<T>(values: (T | PromiseLike<T>)[]): CancelablePromise<T[]> {
        return new CancelablePromise(Promise.all(values))
            .catch((error) => {
                if (isCancelError(error)) {
                    for (const value of values) {
                        if (value instanceof CancelablePromise) {
                            value.cancel()
                        }
                    }
                }
                throw error
            })
    }


    private _wrappedPromise: Promise<ValueType>


    /**
     * @param executorOrPromise
     *        One of:
     *          - executor function: A function which executes the operation represented by this promise.
     *            At some point in time, one of the resolution methods `resolve(value: any)`,
     *            `reject(error: Error)` or `cancel(taskDesc: ?string)` must be called.
     *          - a promise: A promise to wrap for adding cancel support
     */
    constructor(executorOrPromise: Executor<ValueType> | Promise<ValueType>) {
        let executor: Executor<ValueType>
        if (typeof executorOrPromise === 'function') {
            executor = executorOrPromise
        } else if (executorOrPromise instanceof Promise) {
            let wrappedPromise = executorOrPromise
            executor = (resolve, reject, cancel) => {
                wrappedPromise.then(resolve, reject)
            }
        } else {
            throw new Error('Expected executorOrPromise to be either a function or a Promise, but it is ' + typeof executorOrPromise)
        }

        // Workaround: Extending Promise didn't work - calling `super` constructor threw
        //             `TypeError: undefined is not a promise` (tested on Cordova running on Android)
        //             -> We wrap a Promise and fake class extending
        this._wrappedPromise = new Promise((resolve, reject) => {
            this.cancel = taskDesc => {
                reject(createCancelError(taskDesc))
            }

            executor(resolve as (value: ValueOrPromise<ValueType>) => void, reject, this.cancel)
        })
    }

    readonly [Symbol.toStringTag]: 'Promise'

    /**
     * Cancels this promise. This will reject the promise with an error object having a property
     * `isCancelled` set to `true`.
     */
    cancel(taskDesc?: string) {
        // Dummy method - will be overridden by constructor
    }

    /**
     * Wrapper for [Promise.then](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Promise/then)
     * returning a CancelablePromise.
     *
     * @param onFulfilled - A function called when the Promise is fulfilled. This function has one argument, the fulfillment value.
     * @param onRejected - A function called when the Promise is rejected. This function has one argument, the rejection reason.
     * @returns the child promise
     */
    then<TResult1 = ValueType, TResult2 = never>(
        onfulfilled?: ((value: ValueType) => TResult1 | PromiseLike<TResult1>) | undefined | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null):
        CancelablePromise<TResult1 | TResult2>
    {
        return linkChildPromise(this, this._wrappedPromise.then(onfulfilled, onrejected))
    }

    /**
     * Wrapper for [Promise.catch](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/catch)
     * returning a CancelablePromise.
     *
     * @param onRejected - A function called when the Promise is rejected. This function has one argument, the rejection reason.
     * @returns the child promise
     */
    catch<ChildValueType>(onRejected?: (error: any) => ValueOrPromise<ChildValueType>): CancelablePromise<ChildValueType> {
        return linkChildPromise(this, this._wrappedPromise.catch(
            onRejected as (error: any) => ChildValueType | Promise<ChildValueType>))
    }

};

(CancelablePromise.prototype as any).__proto__ = new Promise(() => {})  // Make `instanceof Promise` checks work


let linkingChildPromise = false

// Turns a child promise into a CancelablePromise which lets cancels walk up the promise chain
function linkChildPromise<ValueType, ChildValueType>(parentPromise: CancelablePromise<ChildValueType>, childPromise: any) {
    if (!linkingChildPromise) {
        if (! (childPromise instanceof CancelablePromise)) {
            childPromise = new CancelablePromise(childPromise)
        }

        try {
            linkingChildPromise = true
            childPromise.catch((error: Error) => {
                if (isCancelError(error)) {
                    parentPromise.cancel()
                }
            })
        } finally {
            linkingChildPromise = false
        }
    }

    return childPromise
}


/**
 * Create an error indicating that a task has been cancelled.
 * You can check for such an error using {@link isCancelError}.
 *
 * @param taskDesc the description of the cancelled task
 * @returns the cancel error
 */
export function createCancelError(taskDesc = 'Task'): Error {
    let error = new Error(`${taskDesc} has been cancelled`);
    (error as any).isCancelled = true
    return error
}


/**
 * Throws an error indicating that a task has been cancelled.
 * You can check for such an error using {@link isCancelError}.
 *
 * @throws the cancel error
 */
export function throwCancelError(taskDesc: string): never {
    throw createCancelError(taskDesc)
}


/**
 * Returns whether an error indicates that the according task has been cancelled.
 * Like a cancel error as created by {@link throwCancelError}.
 *
 * @protected
 * @param error - the error to check
 * @return whether the error indicates that the according task has been cancelled
 */
export function isCancelError(error?: any): boolean {
    return error && error.isCancelled
}
