package io.github.kemou2333.campusinbox;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.UUID;

/** One bounded temporary export; no general storage access and no caller-supplied paths. */
final class NativeExport {
    private final File directory;
    private Session session;

    static final class Session {
        final String token;
        final String name;
        final String mime;
        final long size;
        final File file;
        long bytes;
        boolean sealed;

        Session(String token, String name, String mime, long size, File file) {
            this.token = token;
            this.name = name;
            this.mime = mime;
            this.size = size;
            this.file = file;
        }
    }

    NativeExport(File cacheDirectory) throws IOException {
        directory = new File(cacheDirectory, "campus-exports");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("无法准备导出文件");
        File[] old = directory.listFiles();
        if (old != null) for (File file : old) if (file.isFile() && file.getName().startsWith("export-")) file.delete();
    }

    synchronized Session begin(String name, String mime, long size) throws IOException {
        if (session != null) throw new IllegalStateException("已有一个文件正在保存");
        if (size < 0 || size > NativePolicy.MAX_EXPORT_BYTES) throw new IllegalArgumentException("导出文件过大");
        String token = UUID.randomUUID().toString();
        File file = File.createTempFile("export-", ".part", directory);
        session = new Session(token, NativePolicy.fileName(name), NativePolicy.mime(mime), size, file);
        return session;
    }

    synchronized long append(String token, String base64) throws IOException {
        Session active = require(token);
        if (active.sealed) throw new IllegalStateException("文件已准备好，请完成保存");
        byte[] bytes = NativePolicy.decodeChunk(base64);
        if (active.bytes + bytes.length > active.size) throw new IllegalArgumentException("文件大小不符");
        try (FileOutputStream output = new FileOutputStream(active.file, true)) {
            output.write(bytes);
        }
        active.bytes += bytes.length;
        return active.bytes;
    }

    synchronized Session seal(String token) {
        Session active = require(token);
        if (active.sealed) throw new IllegalStateException("文件已准备好，请完成保存");
        if (active.bytes != active.size) throw new IllegalArgumentException("文件尚未完整传输");
        active.sealed = true;
        return active;
    }

    synchronized void copyTo(String token, OutputStream output) throws IOException {
        Session active = require(token);
        if (!active.sealed) throw new IllegalStateException("文件尚未准备好");
        try (FileInputStream input = new FileInputStream(active.file)) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            output.flush();
        }
    }

    synchronized void cancel(String token) {
        if (session == null) return;
        if (!session.token.equals(token)) throw new IllegalArgumentException("文件会话已失效");
        clear();
    }

    synchronized void clear() {
        if (session != null) session.file.delete();
        session = null;
    }

    private Session require(String token) {
        if (session == null || !session.token.equals(token)) throw new IllegalArgumentException("文件会话已失效");
        return session;
    }
}
