export function vendorFilePreviewHref(blobUrl: string): string {
  return `/api/hair/vendor-files?url=${encodeURIComponent(blobUrl)}`;
}
