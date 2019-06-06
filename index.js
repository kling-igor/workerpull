import EventEmitter from 'events'
import uuidv4 from 'uuid/v4'

class Worker extends EventEmitter {
  tasksQueue = []

  constructor(id) {
    super()
    console.log('creating new worker:', id)
    this.id = id
  }

  post(marker, fileName, buffer, version) {
    console.log(`worker ${this.id} busy with file ${fileName}`)
    // console.log('Worker:post ', marker, fileName, buffer, version)
    // const id = uuidv4()

    const timerId = setTimeout(() => {
      // console.log(`worker task ${id} done`)

      // this.tasksQueue = this.tasksQueue.filter(task => task.id !== id)
      console.log(`worker ${this.id} idle`)
      this.emit('message', this.id, marker, fileName, version, '**eslint markers**', '##output##')
    }, 2666)

    // this.tasksQueue.push({ id, timerId })
  }

  dispose() {
    console.log('dispose worker ', this.id)
    // this.tasksQueue.forEach(({ timerId }) => clearTimeout(timerId))
    this.tasksQueue = []
  }
}

const MAX_WORKERS = 5
const WORKERS = 3

class LinterQueue {
  busyWorkers = []
  idleWorkers = []

  runningTasks = []
  pendingTasks = []

  newWorkerUUID = 0

  constructor() {
    // this.worker.on('message', this.handleWorkerResponse)
    for (let i = 0; i < WORKERS; i += 1) {
      const workerId = this.newWorkerUUID
      const worker = new Worker(workerId)
      worker.on('message', this.handleWorkerResponse)
      this.idleWorkers.push(worker)

      // this.idleWorkersIds.push(workerId)
      this.newWorkerUUID += 1
    }
  }

  dispose() {
    // this.worker.removeAllListeners('message')
    this.pendingTasks.forEach(({ abort }) => abort())
    this.pendingTasks = []

    this.runningTasks = []
  }

  loadWorker(marker, fileName, buffer, version) {
    console.log('loading worker with file:', fileName)
    // // если пулл ворекров не заполнен и нет свободных воркеров, то нужно создать еще
    // if (this.workerPull.length < WATERMARK && this.idleWorkersIds.length === 0) {
    //   const workerId = this.workerPull.length
    //   const worker = new Worker(workerId)
    //   worker.on('message', this.handleWorkerResponse)
    //   this.workerPull.push(worker)

    //   this.idleWorkersIds = [...this.idleWorkersIds, workerId]
    // }

    if (this.idleWorkers.length === 0) {
      console.error('NO FREE WORKERS!!!!')
      const workerId = this.newWorkerUUID
      const worker = new Worker(workerId)
      this.newWorkerUUID += 1
      worker.on('message', this.handleWorkerResponse)
      this.idleWorkers.push(worker)
    }

    const idleWorker = this.idleWorkers.shift()
    this.busyWorkers.push(idleWorker)
    idleWorker.post(marker, fileName, buffer, version)
  }

  lint({ fileName, buffer, version }) {
    return new Promise((resolve, reject) => {
      const marker = uuidv4()

      const timeoutHandler = {}

      const abort = () => {
        clearTimeout(timeoutHandler.timerId)
        reject({ fileName })
      }

      const task = () => {
        timeoutHandler.timerId = setTimeout(abort, 3000)
        this.loadWorker(marker, fileName, buffer, version)
      }

      this.pendingTasks.push({
        fileName, // remove!!! FOR DEBUG ONLY
        marker,
        task,
        resolve: (...args) => {
          clearTimeout(timeoutHandler.timerId)
          resolve(...args)
        },
        abort
      })

      // const tasks = this.pendingTasks.map(({ fileName }) => fileName).join(' | ')
      // console.log('PUT NEW TASK:', tasks)

      // если задач ровно 1 в очереди или есть свободные воркеры, то выполнить ее
      // if (/*this.idleWorkersIds.length > 0 && */ this.queue.length === 1) {

      // if (this.idleWorkers.length > 0 || this.busyWorkers.length < MAX_WORKERS) {
      if (this.idleWorkers.length > 0) {
        const current = this.pendingTasks.shift()
        this.runningTasks.push(current)
        current.task()
      }
      // }

      // }
    })
  }

  handleWorkerResponse = (workerId, marker, fileName, version, markers, output) => {
    console.log('handleWorkerResponse:', workerId)
    const taskIndex = this.runningTasks.findIndex(task => task.marker === marker)
    if (taskIndex === -1) {
      console.log('TASK NOT FOUND')

      return
    }

    const [task] = this.runningTasks.splice(taskIndex, 1)
    task.resolve({ fileName, version, markers, output })

    const workerIndex = this.busyWorkers.findIndex(worker => worker.id === workerId)
    if (workerIndex !== -1) {
      const [worker] = this.busyWorkers.splice(workerIndex, 1)
      this.idleWorkers.push(worker)

      console.log(`BUSY: ${this.busyWorkers.length}, IDLE: ${this.idleWorkers.length}`)
    } else {
      console.log('worker not found:', workerId)
    }

    // console.log('free workers:', this.idleWorkersIds)

    const pendingTaskCount = this.pendingTasks.length

    // console.log('pending tasks:', pendingTaskCount)

    console.log(`has ${pendingTaskCount} pending tasks`)
    if (pendingTaskCount > 0) {
      // запускаем наиболее старую задачу (скорее все на освободившемся воркере)
      const current = this.pendingTasks.shift()
      this.runningTasks.push(current)
      current.task()
    } else {
      // пытаемся урезать пулл воркеров
      const length = Math.floor(this.idleWorkers.length / 2)
      if (length) {
        const removingWorkers = this.idleWorkers.splice(0, length)
        //   console.log('REMOVING WORKERS:', removingWorkersIds)
        for (const worker of removingWorkers) {
          worker.dispose()
        }

        console.log('remain idle workers:', this.idleWorkers.length)
      }
    }
  }
}

const linterqueue = new LinterQueue()

let counter = 0

const launchTask = () => {
  // пример внезапного запроса на прекращение всего
  // if (counter === 7) {
  //   console.log('clear !!!!!!!!!!!')
  //   linterqueue.dispose()
  //   return
  // }

  if (counter < 10) {
    linterqueue
      .lint({ fileName: `${counter}.js`, buffer: 'content', version: 1 })
      .then(({ fileName, version, output, markers }) => {
        console.log('READY ', fileName)
        // ищем в открытых файлах fileName
        // если версия его модели совпадает с version, то
        // применяем маркеры (если есть)
        // применяем output (если есть)
      })
      .catch(({ fileName }) => {
        console.log('timeout for lint file ', fileName)
      })

    counter += 1
    setTimeout(launchTask, 600)
  }
}

launchTask()
