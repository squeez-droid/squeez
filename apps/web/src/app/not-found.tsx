import Link from "next/link";
import { Empty } from "@/components/ui";
import { Button } from "@/components/ui";

export default function NotFound() {
  return <div className="py-16"><Empty title="Token not found" body="No indexed on-chain token matches this address." action={<Link href="/explore"><Button>Back to Explore</Button></Link>} /></div>;
}
