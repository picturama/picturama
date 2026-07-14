
class JobInfo<Job, JobResult> {

    public promise: Promise<JobResult>
    public resolve: (value: JobResult) => void
    public reject: (error: any) => void
    
    constructor(public job: Job) {
        this.promise = new Promise<JobResult>((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
        })
    }

}


/**
 * A queue of jobs to execute serially (only one job at a time).
 * Ensuring a shared is not accessed in parallel.
 */
export default class SerialJobQueue<Job, JobResult> {

    private jobQueue: JobInfo<Job, JobResult>[] = []
    private isJobRunning = false


    constructor(
        private combineJobs: (newJob: Job, existingJob: Job) => Job | null,
        private processJob: (job: Job) => Promise<JobResult>,
        private getJobPriority?: (job: Job) => number)
    {
    }


    addJob(job: Job): Promise<JobResult> {
        for (const jobInfo of this.jobQueue) {
            const combinedJob = this.combineJobs(job, jobInfo.job)
            if (combinedJob !== null) {
                // We can combine these jobs
                // => Update job info and share the promise
                jobInfo.job = combinedJob
                return jobInfo.promise
            }
        }
    
        const jobInfo = new JobInfo<Job, JobResult>(job)
        this.jobQueue.push(jobInfo)
        this.checkQueue()
    
        return jobInfo.promise
    }

    getQueueLength() {
        return this.jobQueue.length
    }

    private checkQueue() {
        if (this.isJobRunning) {
            return
        }

        let nextJobInfo: JobInfo<Job, JobResult> | undefined = undefined
        if (this.getJobPriority) {
            let nextJobIndex = -1
            let nextJobPrio = Number.NEGATIVE_INFINITY
            const jobCount = this.jobQueue.length
            for (let jobIndex = 0; jobIndex < jobCount; jobIndex++) {
                const jobInfo = this.jobQueue[jobIndex]
                const prio = this.getJobPriority(jobInfo.job)
                if (nextJobIndex === -1 || prio > nextJobPrio) {
                    nextJobIndex = jobIndex
                    nextJobPrio = prio
                }
            }
            if (nextJobIndex !== -1) {
                nextJobInfo = this.jobQueue.splice(nextJobIndex, 1)[0]
            }
        } else {
            nextJobInfo = this.jobQueue.shift()
        }

        const nailedNextJobInfo = nextJobInfo
        if (!nailedNextJobInfo) {
            return
        }
    
        this.isJobRunning = true
        this.processJob(nailedNextJobInfo.job)
            .then(
                thumbailData => nailedNextJobInfo.resolve(thumbailData),
                error => nailedNextJobInfo.reject(error))
            .then(() => {
                this.isJobRunning = false
                this.checkQueue()
            })
    }
    
}
