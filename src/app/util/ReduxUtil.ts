import { Store } from 'redux'

import { isShallowEqual } from 'app/util/LangUtil'


/**
 * Observes a react store with state selection
 *
 * @param store the react store
 * @param select selects the wanted part of the state
 * @param onChange Called when the selected sub state has changed
 * @returns Unsubsriber - call it to unsubscribe
 */
// Source see: https://github.com/reactjs/redux/issues/303#issuecomment-125184409
export function observeStore<ReduxState, SubState>(store: Store<ReduxState>, select: (state: ReduxState) => SubState, onChange: (substate: SubState) => void): () => void {
    let currentState: SubState | undefined

    function handleChange() {
        let nextState = select(store.getState())
        if (!isShallowEqual(nextState, currentState)) {
            currentState = nextState
            onChange(currentState)
        }
    }

    let unsubscribe = store.subscribe(handleChange)
    handleChange()
    return unsubscribe
}
