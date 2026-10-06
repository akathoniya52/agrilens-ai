import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { NextResponse } from "next/server";
import { isDuplicateKey } from "./http";
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
      // One atomic upsert, so two tabs finishing first sign-in together can't both try to create the user.
      const createIfMissing = () =>
        User.findOneAndUpdate(
          { email: user.email },
          {
            $setOnInsert: {
              name: user.name,
              email: user.email,
              image: user.image,
              providerId: account?.providerAccountId,
              credits: 100,
            },
          },
          { upsert: true, setDefaultsOnInsert: true }
        );
      try {
        await createIfMissing();
      } catch (error) {
        // Concurrent upserts can still race on the unique email index; the other one created the user.
        if (!isDuplicateKey(error)) throw error;
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
