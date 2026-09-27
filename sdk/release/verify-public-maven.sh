#!/usr/bin/env bash
set -Eeuo pipefail

cleanroom="$(mktemp -d)"
trap 'rm -rf "$cleanroom"' EXIT
mkdir -p "$cleanroom/src/main/java/example"
cat > "$cleanroom/pom.xml" <<'XML'
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>example</groupId><artifactId>truyn-maven-cleanroom</artifactId><version>1.0.0</version>
  <properties><maven.compiler.release>17</maven.compiler.release></properties>
  <dependencies><dependency><groupId>org.truyn</groupId><artifactId>truyn-sdk</artifactId><version>0.1.0-alpha.1</version></dependency></dependencies>
  <build><plugins><plugin><groupId>org.codehaus.mojo</groupId><artifactId>exec-maven-plugin</artifactId><version>3.5.0</version></plugin></plugins></build>
</project>
XML
cat > "$cleanroom/src/main/java/example/Main.java" <<'JAVA'
package example;
import java.net.URI;
import org.truyn.sdk.TruynClient;
public final class Main {
  public static void main(String[] args) {
    TruynClient client = TruynClient.builder().baseUrl(URI.create("https://example.invalid/")).build();
    if (!client.getClass().getName().equals("org.truyn.sdk.TruynClient")) throw new IllegalStateException("unexpected SDK class");
    System.out.println("truyn-maven-cleanroom-ok");
  }
}
JAVA
mvn -q -U -f "$cleanroom/pom.xml" dependency:get -Dartifact=org.truyn:truyn-sdk:0.1.0-alpha.1
mvn -q -f "$cleanroom/pom.xml" compile
output="$(mvn -q -f "$cleanroom/pom.xml" exec:java -Dexec.mainClass=example.Main)"
printf '%s\n' "$output" | grep -Fx 'truyn-maven-cleanroom-ok'
mvn -q -f "$cleanroom/pom.xml" dependency:tree -Dincludes=org.truyn:truyn-sdk -DoutputFile="$cleanroom/tree.txt"
grep -F 'org.truyn:truyn-sdk:jar:0.1.0-alpha.1:compile' "$cleanroom/tree.txt"
