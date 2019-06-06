import EventEmitter from 'events'
import uuidv4 from 'uuid/v4'

class Worker extends EventEmitter {
  tasksQueue = []

  post(marker, fileName, buffer, version) {
    // console.log('Worker:post ', marker, fileName, buffer, version)
    const id = uuidv4()

    const timerId = setTimeout(() => {
      // console.log(`worker task ${id} done`)

      this.tasksQueue = this.tasksQueue.filter(task => task.id !== id)
      this.emit('message', marker, fileName, version, '**eslint markers**', '##output##')
    }, 1000)

    this.tasksQueue.push({ id, timerId })
  }

  clear() {
    this.tasksQueue.forEach(({ timerId }) => clearTimeout(timerId))
    this.tasksQueue = []
  }
}

class LinterQueue {
  worker = new Worker()

  queue = []

  constructor() {
    this.worker.on('message', this.handleWorkerResponse)
  }

  dispose() {
    this.worker.removeListener('message', this.handleWorkerResponse)
    this.queue = []
  }

  lint({ fileName, buffer, version }) {
    return new Promise((resolve, reject) => {
      const marker = uuidv4()

      const timeoutHandler = {}

      const task = () => {
        console.log('running task for ', fileName)
        timeoutHandler.timerId = setTimeout(() => {
          console.log('rejecting by timeout')
          reject({ fileName })
        }, 2000)

        this.worker.post(marker, fileName, buffer, version)
      }

      this.queue.push({
        fileName, // remove!!! FOR DEBUG ONLY
        marker,
        task,
        resolve: (...args) => {
          clearTimeout(timeoutHandler.timerId)
          resolve(...args)
        }
      })

      const tasks = this.queue.map(({ fileName }) => fileName).join(' | ')
      console.log('PUT NEW TASK:', tasks)

      // если задач ровно 1 в очереди, то выполнить ее
      if (this.queue.length === 1) {
        this.queue[0].task()
      }
    })
  }

  handleWorkerResponse = (marker, fileName, version, markers, output) => {
    const index = this.queue.findIndex(task => task.marker === marker)
    if (index !== -1) {
      this.queue[index].resolve({ fileName, version, markers, output })
      this.queue.splice(index, 1)

      const pendingTaskCount = this.queue.length

      // console.log('pending tasks:', pendingTaskCount)

      if (pendingTaskCount > 0) {
        this.queue[0].task()
      }
    }
  }
}

const linterqueue = new LinterQueue()

let counter = 0

const launchTask = () => {
  // пример внезапного запроса на прекращение всего
  if (counter === 7) {
    console.log('clear !!!!!!!!!!!')
    linterqueue.dispose()
    return
  }

  if (counter < 10) {
    linterqueue
      .lint({ fileName: `${counter}.js`, buffer: 'content', version: 1 })
      .then(({ fileName, version, output, markers }) => {
        console.log('ready ', fileName)
        // ищем в открытых файлах fileName
        // если версия его модели совпадает с version, то
        // применяем маркеры (если есть)
        // применяем output (если есть)
      })
      .catch(({ fileName }) => {
        console.log('timeout for lint file ', fileName)
      })

    counter += 1
    setTimeout(launchTask, 750)
  }
}

launchTask()
