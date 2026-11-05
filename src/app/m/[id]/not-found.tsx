import Link from "next/link";

export default function ShopNotFound() {
  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>This shop is gone</h1>
          <p className="lede">
            Shops live in server memory. A restart removes them, and so does the cap of 200 shops.{" "}
            <Link className="plain-link" href="/setup">Set up a new shop</Link>.
          </p>
        </div>
      </header>
    </div>
  );
}
