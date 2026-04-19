import express from 'express'
import {
  listDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument
} from '../controllers/landRegistryDocumentsController'

const router = express.Router()

router.get('/', listDocuments)
router.get('/:id', getDocument)
router.post('/', createDocument)
router.put('/:id', updateDocument)
router.delete('/:id', deleteDocument)

export default router
