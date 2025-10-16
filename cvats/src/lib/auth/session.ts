import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";

export const getAuthSession = () => getServerSession(authOptions);
