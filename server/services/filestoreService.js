'use strict';

/**
 * filestoreService.js — Catalyst File Store helpers
 * ─────────────────────────────────────────────────
 * The upload pipeline is expected to use Catalyst File Store, but local
 * development environments can be missing valid Catalyst credentials. When that
 * happens this service falls back to a local filesystem store that preserves the
 * same method contract so the UI can still upload and later download CSVs.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PassThrough } = require('stream');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const STORAGE_ROOT = path.resolve(__dirname, '..', 'data', 'filestore');
const FILES_DIR = path.join(STORAGE_ROOT, 'files');
const METADATA_DIR = path.join(STORAGE_ROOT, 'metadata');

function bufferToStream(buffer) {
  const pt = new PassThrough();
  pt.end(buffer);
  return pt;
}

function sanitizeName(name) {
  return String(name || '')
    .trim()
    .replace(/[\\/]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_') || `upload_${Date.now()}.csv`;
}

function ensureStorageDirs() {
  fs.mkdirSync(FILES_DIR, { recursive: true });
  fs.mkdirSync(METADATA_DIR, { recursive: true });
}

function getMetadataPath(fileId) {
  return path.join(METADATA_DIR, `${String(fileId)}.json`);
}

function getPhysicalFilePath(fileId) {
  return path.join(FILES_DIR, `${String(fileId)}.bin`);
}

function createLocalMetadata(fileId, filename, folderId, mimeType, absolutePath) {
  return {
    file_id: String(fileId),
    filename: String(filename || 'upload.csv'),
    absolute_path: absolutePath,
    mime_type: mimeType || 'text/csv',
    upload_time: new Date().toISOString(),
    folder_id: String(folderId || process.env.CATALYST_CSV_FOLDER_ID || 'local'),
  };
}

function writeMetadata(metadata) {
  ensureStorageDirs();
  const metadataPath = getMetadataPath(metadata.file_id);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  return metadataPath;
}

function readMetadata(fileId) {
  const metadataPath = getMetadataPath(fileId);
  if (!fs.existsSync(metadataPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
}

function deleteMetadata(fileId) {
  const metadataPath = getMetadataPath(fileId);
  if (fs.existsSync(metadataPath)) {
    fs.unlinkSync(metadataPath);
  }
}

function makeLocalFolder(folderId) {
  const resolvedFolderId = String(folderId || process.env.CATALYST_CSV_FOLDER_ID || 'local');
  return {
    async uploadFile({ code, name }) {
      ensureStorageDirs();
      const chunks = [];
      for await (const chunk of code) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);
      const fileId = crypto.randomUUID();
      const safeName = sanitizeName(name);
      const extension = path.extname(safeName) || '.csv';
      const physicalPath = path.join(FILES_DIR, `${fileId}${extension}`);
      fs.writeFileSync(physicalPath, buffer);
      const metadata = createLocalMetadata(fileId, safeName, resolvedFolderId, 'text/csv', physicalPath);
      writeMetadata(metadata);
      return {
        id: fileId,
        file_name: safeName,
        file_location: physicalPath,
      };
    },
    async downloadFile(fileId) {
      const metadata = readMetadata(fileId);
      if (!metadata || !metadata.absolute_path) {
        throw new Error(`[FileStore] Local file not found for file_id=${fileId}`);
      }
      const filePath = metadata.absolute_path;
      if (!fs.existsSync(filePath)) {
        throw new Error(`[FileStore] Local file not found for file_id=${fileId}`);
      }
      return fs.readFileSync(filePath);
    },
    async getFile(fileId) {
      const metadata = readMetadata(fileId);
      if (!metadata) {
        throw new Error(`[FileStore] Local file metadata not found for file_id=${fileId}`);
      }
      return metadata;
    },
    async deleteFile(fileId) {
      const metadata = readMetadata(fileId);
      if (!metadata) {
        return false;
      }
      const filePath = metadata.absolute_path;
      deleteMetadata(fileId);
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return true;
    },
  };
}

function getFolder(req, folderId) {
  const app = req && req.catalyst;
  const id = String(folderId || process.env.CATALYST_CSV_FOLDER_ID || 'local');

  if (!app) {
    return makeLocalFolder(id);
  }

  return app.filestore().folder(String(id));
}

async function uploadCsvBuffer(req, buffer, filename) {
  const folderId = process.env.CATALYST_CSV_FOLDER_ID;
  const folder = getFolder(req, folderId);

  const safeName = sanitizeName(filename) || `upload_${Date.now()}.csv`;

  console.log(`[FileStore] Upload started: "${safeName}" (${buffer.length} bytes) → folder ${folderId}`);

  const stream = bufferToStream(buffer);
  const result = await folder.uploadFile({ code: stream, name: safeName });

  const fileId = String(result.id);
  console.log(`[FileStore] Upload succeeded: file_id=${fileId}, name="${result.file_name}"`);

  return {
    file_id: fileId,
    folder_id: String(folderId),
    filename: result.file_name || safeName,
    size_bytes: buffer.length,
  };
}

async function downloadCsvBuffer(req, folderId, fileId) {
  const folder = getFolder(req, folderId);

  console.log(`[FileStore] Download started: file_id=${fileId} from folder ${folderId}`);
  const buffer = await folder.downloadFile(String(fileId));

  console.log(`[FileStore] Download succeeded: ${buffer.length} bytes`);
  return buffer;
}

async function getFile(req, folderId, fileId) {
  const folder = getFolder(req, folderId);
  if (typeof folder.getFile === 'function') {
    return folder.getFile(String(fileId));
  }
  const metadata = readMetadata(fileId);
  if (!metadata) {
    throw new Error(`[FileStore] Local file metadata not found for file_id=${fileId}`);
  }
  return metadata;
}

async function deleteFile(req, folderId, fileId) {
  const folder = getFolder(req, folderId);

  const ok = await folder.deleteFile(String(fileId));
  if (ok) {
    console.log(`[FileStore] Delete succeeded: file_id=${fileId}`);
  } else {
    console.warn(`[FileStore] Delete returned false for file_id=${fileId}`);
  }
  return ok;
}

module.exports = { uploadCsvBuffer, downloadCsvBuffer, getFile, deleteFile };
