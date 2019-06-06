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

const WORKERS = 3

class LinterQueue {
  // worker = new Worker()

  workerPull = []

  idleWorkersIds = []

  queue = []

  runningTasks = []

  newWorkerUUID = 0

  constructor() {
    // this.worker.on('message', this.handleWorkerResponse)
    for (let i = 0; i < WORKERS; i += 1) {
      const workerId = this.newWorkerUUID
      const worker = new Worker(workerId)
      worker.on('message', this.handleWorkerResponse)
      this.workerPull.push(worker)
      this.idleWorkersIds.push(workerId)
      this.newWorkerUUID += 1
    }
  }

  dispose() {
    // this.worker.removeAllListeners('message')
    this.queue.forEach(({ abort }) => abort())
    this.queue = []
  }

  loadWorker(marker, fileName, buffer, version) {
    // // если пулл ворекров не заполнен и нет свободных воркеров, то нужно создать еще
    // if (this.workerPull.length < WATERMARK && this.idleWorkersIds.length === 0) {
    //   const workerId = this.workerPull.length
    //   const worker = new Worker(workerId)
    //   worker.on('message', this.handleWorkerResponse)
    //   this.workerPull.push(worker)

    //   this.idleWorkersIds = [...this.idleWorkersIds, workerId]
    // }

    if (this.idleWorkersIds.length === 0) {
      console.error('NO FREE WORKERS!!!!')
      const workerId = this.newWorkerUUID
      const worker = new Worker(workerId)
      this.newWorkerUUID += 1
      worker.on('message', this.handleWorkerResponse)
      this.workerPull.push(worker)
      this.idleWorkersIds = [...this.idleWorkersIds, workerId]
    } else {
      const idleWorkerId = this.idleWorkersIds.shift()
      // на всякий случай удаляем возможные дубликаты
      this.idleWorkersIds = this.idleWorkersIds.filter(i => i !== idleWorkerId)

      console.log(`loading worker ${idleWorkerId} on task ${fileName}, freeWorkers: ${this.idleWorkersIds}`)
      this.workerPull[idleWorkerId].post(marker, fileName, buffer, version)
    }
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
        timeoutHandler.timerId = setTimeout(abort, 2000)
        this.loadWorker(marker, fileName, buffer, version)
      }

      this.queue.push({
        fileName, // remove!!! FOR DEBUG ONLY
        marker,
        task,
        resolve: (...args) => {
          clearTimeout(timeoutHandler.timerId)
          resolve(...args)
        },
        abort
      })

      const tasks = this.queue.map(({ fileName }) => fileName).join(' | ')
      // console.log('PUT NEW TASK:', tasks)

      // если задач ровно 1 в очереди или есть свободные воркеры, то выполнить ее
      // if (/*this.idleWorkersIds.length > 0 && */ this.queue.length === 1) {
      const current = this.queue.shift()
      this.runningTasks.push(current)
      current.task()
      // }
    })
  }

  handleWorkerResponse = (workerId, marker, fileName, version, markers, output) => {
    const index = this.runningTasks.findIndex(task => task.marker === marker)
    if (index !== -1) {
      const [task] = this.runningTasks.splice(index, 1)
      task.resolve({ fileName, version, markers, output })

      // говорим что этот воркер свободен
      this.idleWorkersIds.push(workerId)
      // console.log('free workers:', this.idleWorkersIds)

      const pendingTaskCount = this.queue.length

      // console.log('pending tasks:', pendingTaskCount)

      if (pendingTaskCount > 0) {
        // запускаем наиболее старую задачу (скорее все на освободившемся воркере)
        const current = this.queue.shift()
        this.runningTasks.push(current)
        current.task()
      } else {
        // пытаемся урезать пулл воркеров
        // TODO: работа с воркерами в предположении что идентификатор воркера совпадает с его положением в пулле, что в случае удаления НЕ ВЕРНО!!!
        // СКОРРЕКТИРОВАТЬ ЭТОТ ВОПРОС
        // const length = Math.floor(this.idleWorkersIds.length / 2)
        // if (length) {
        //   const removingWorkersIds = this.idleWorkersIds.splice(0, length)
        //   console.log('REMOVING WORKERS:', removingWorkersIds)
        //   for (const i of removingWorkersIds) {
        //     // const [worker] = this.workerPull.splice(i, 1)
        //     worker.dispose()
        //   }
        // }
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
        // console.log('timeout for lint file ', fileName)
      })

    counter += 1
    setTimeout(launchTask, 600)
  }
}

launchTask()
