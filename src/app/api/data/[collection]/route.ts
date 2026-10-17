import { collectionNames, isCollectionName, loadCollection, type CollectionName } from "@/lib/collections";
import { jsonError, jsonOk, toErrorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * 客户端读数据的唯一出口：只允许白名单集合，永远不直接暴露文件路径。
 */
export async function GET(_request: Request, { params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params;

  if (!isCollectionName(collection)) {
    return jsonError(`未知的数据集合：${collection}`, 404, { available: collectionNames });
  }

  try {
    const data = await loadCollection(collection as CollectionName);
    return jsonOk(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}
