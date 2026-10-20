import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function getFilePath(fileParams: string[]): string | null {
  const fileName = fileParams.join('/');
  // Prevent path traversal
  const safeFileName = path.normalize(fileName).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(process.cwd(), 'public', 'downloads', safeFileName);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    return null;
  }

  return filePath;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ file: string[] }> }
) {
  const { file } = await context.params;
  const filePath = getFilePath(file);

  if (!filePath) {
    return new NextResponse('File Not Found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store',
      },
    });
  }

  const stat = fs.statSync(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const isApk = fileName.toLowerCase().endsWith('.apk');

  const headers: Record<string, string> = {
    'Content-Length': stat.size.toString(),
  };

  if (isApk) {
    headers['Content-Type'] = 'application/vnd.android.package-archive';
    headers['Content-Disposition'] = `attachment; filename="${fileName}"`;
  }

  return new NextResponse(fileBuffer, {
    status: 200,
    headers,
  });
}

export async function HEAD(
  _request: NextRequest,
  context: { params: Promise<{ file: string[] }> }
) {
  const { file } = await context.params;
  const filePath = getFilePath(file);

  if (!filePath) {
    return new NextResponse(null, {
      status: 404,
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store',
      },
    });
  }

  const stat = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  const isApk = fileName.toLowerCase().endsWith('.apk');

  const headers: Record<string, string> = {
    'Content-Length': stat.size.toString(),
  };

  if (isApk) {
    headers['Content-Type'] = 'application/vnd.android.package-archive';
    headers['Content-Disposition'] = `attachment; filename="${fileName}"`;
  }

  return new NextResponse(null, {
    status: 200,
    headers,
  });
}
