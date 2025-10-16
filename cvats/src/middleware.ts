import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withAuth } from "next-auth/middleware";

type AuthenticatedRequest = NextRequest & {
  nextauth?: {
    token?: unknown;
  };
};

const authMiddleware = withAuth(
  (request: NextRequest) => {
    const { nextauth } = request as AuthenticatedRequest;
    if (nextauth?.token) {
      return NextResponse.next();
    }

    const loginUrl = new URL("/login", request.url);
    const callbackDestination = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    loginUrl.searchParams.set("callbackUrl", callbackDestination || "/dashboard");
    return NextResponse.redirect(loginUrl);
  },
  {
    callbacks: {
      authorized: () => true,
    },
  },
);

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
};

export default authMiddleware;
