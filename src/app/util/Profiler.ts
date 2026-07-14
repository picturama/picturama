import { logProfilesInstantly } from 'app/LogConstants'


/**
 * Helper class for performance measuring.
 */
export default class Profiler {

    title: string
    measureList: string[]
    measureStartTime: number
    overallDuration: number


    /**
     * Constructor.
     *
     * @param title the title for the whole measure session
     */
    constructor(title: string) {
        this.measureList = []
        this.startMeasure(title)
    }

    /**
     * Starts a new measure.
     *
     * @param title the title for the whole measure session
     */
    startMeasure(title: string) {
        if (logProfilesInstantly) {
            console.log(title)
        }

        this.title = title
        this.measureStartTime = Date.now()
        this.overallDuration = 0
    }

    /**
     * Adds a watch point. The current measure is added to the list and a new measure will be started.
     *
     * @param title the title of the measure to add
     */
    addPoint(title: string) {
        const duration = Date.now() - this.measureStartTime

        const msg = `${title} (${duration} ms)`
        if (logProfilesInstantly) {
            console.log(`  ${msg}`)
        } else {
            this.measureList.push(msg)
        }
        this.overallDuration += duration

        this.measureStartTime = Date.now()
    }

    /**
     * Logs the result as human readable list.
     */
    logResult() {
        if (!logProfilesInstantly) {
            const result: string[] = []

            result.push(`${this.title} took ${this.overallDuration} ms:`)
            for (const measure of this.measureList) {
                result.push(`\n  ${measure}`)
            }

            console.log(result.join(''))
        }
    }
  
}
