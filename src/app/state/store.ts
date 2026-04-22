import { createStore, applyMiddleware } from 'redux'
import thunk from 'redux-thunk'

import reducers from './reducers'

let enhancer
if ((window as any).PICTURAMA_DEV_MODE) {
    const logger = require('redux-logger').default
    enhancer = applyMiddleware(thunk, logger)
} else {
    enhancer = applyMiddleware(thunk)
}

const store = createStore(reducers, enhancer)

export default store
