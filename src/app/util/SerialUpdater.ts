import store from 'app/state/store'
import { AppState } from 'app/state/StateTypes'
import { bindMany, isShallowEqual } from 'app/util/LangUtil'

import { observeStore } from './ReduxUtil'


export interface SerialUpdaterOptions<UpdateParameters> {
    /**
     * A delay to wait before executing the actual update, so the new parameters are used if the parameters should change
     * during the delay.
     */
    updateDelay?: number
    /**
     * Returns the parameters for the next update. Can return `null` if no update is needed.
     *
     * @param state the app state
     * @return the update parameters (or `null` if no update is needed)
     */
    getUpdateParameters(state: AppState): UpdateParameters | null
    runUpdate(params: UpdateParameters): Promise<void>
}


/**
 * Runs an update if parameters change. There will only be one update running at the same time. If the parameters change
 * during an update, a followup update is done after the currently running update is finished.
 */
export default class SerialUpdater<UpdateParameters> {

    private updateDelayTimeoutId: NodeJS.Timeout | null = null
    private isUpdating = false
    private pendingUpdateParameters: UpdateParameters | null = null
    private lastUpdateParameters: UpdateParameters | null = null


    constructor(private options: SerialUpdaterOptions<UpdateParameters>) {
        bindMany(this, 'onUpdateParametersChange', 'update')
        observeStore(store, options.getUpdateParameters, this.onUpdateParametersChange)
    }

    private onUpdateParametersChange(params: UpdateParameters) {
        this.pendingUpdateParameters = params
        if (this.isUpdating) {
            return
        } else {
            const options = this.options
            const updateDelay = options.updateDelay || 0
            if (updateDelay) {
                if (this.updateDelayTimeoutId) {
                    clearTimeout(this.updateDelayTimeoutId)
                }
                this.updateDelayTimeoutId = setTimeout(this.update, updateDelay)
            } else {
                this.update()
            }
        }
    }

    private async update() {
        const params = this.pendingUpdateParameters
        if (isShallowEqual(params, this.lastUpdateParameters)) {
            this.pendingUpdateParameters = null
            return
        }
        if (this.isUpdating || !params) {
            return
        }

        const options = this.options

        this.isUpdating = true
        this.pendingUpdateParameters = null
        this.lastUpdateParameters = params
        try {
            await options.runUpdate(params)
        } finally {
            this.isUpdating = false

            const pendingUpdateParameters = this.pendingUpdateParameters
            if (pendingUpdateParameters) {
                if (isShallowEqual(params, pendingUpdateParameters)) {
                    this.pendingUpdateParameters = null
                } else {
                    this.update()
                }
            }
        }
    }

}
