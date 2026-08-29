import { RagView } from "@/modules/rag/ui/views/rag-view";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server-session";
import { listRagDocuments } from "@/modules/rag/server/documents";

const Page = async () => {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <RagView initialDocuments={await listRagDocuments(user.id)} />;
};

export default Page;
