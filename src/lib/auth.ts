import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { NextResponse } from "next/server";
import { connectDB } from "./mongodb";
import { User, type UserDoc } from "./models/User";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      await connectDB();
      const existing = await User.exists({ email: user.email });

      if (!existing) {
        await User.create({
          name: user.name,
          email: user.email,
          image: user.image,
          providerId: account?.providerAccountId,
          credits: 100,
        });
      }
      return true;
    },
    async session({ session }) {
      if (session.user?.email) {
        await connectDB();
        const dbUser = await User.findOne({ email: session.user.email })
          .select("_id credits")
          .lean();
        if (dbUser) {
          session.userId = dbUser._id.toString();
          session.credits = dbUser.credits;
        }
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
};

export type RequireUserResult = { user: UserDoc } | { error: NextResponse };

export async function requireUser(): Promise<RequireUserResult> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  await connectDB();
  const user = await User.findOne({ email });
  if (!user) {
    return { error: NextResponse.json({ error: "User not found" }, { status: 404 }) };
  }
  return { user };
}
