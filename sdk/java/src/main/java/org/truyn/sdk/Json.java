package org.truyn.sdk;

import java.lang.reflect.Array;
import java.lang.reflect.RecordComponent;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

final class Json {
  private Json() {}

  static String stringify(Object value) {
    StringBuilder out = new StringBuilder();
    write(value, out);
    return out.toString();
  }

  private static void write(Object value, StringBuilder out) {
    if (value == null) { out.append("null"); return; }
    if (value instanceof String s) { writeString(s, out); return; }
    if (value instanceof Boolean || value instanceof Number) { out.append(value); return; }
    if (value instanceof Map<?, ?> map) {
      TreeMap<String,Object> sorted = new TreeMap<>();
      for (var entry : map.entrySet()) sorted.put(String.valueOf(entry.getKey()), entry.getValue());
      out.append('{'); boolean first = true;
      for (var entry : sorted.entrySet()) {
        if (!first) out.append(','); first = false;
        writeString(entry.getKey(), out); out.append(':'); write(entry.getValue(), out);
      }
      out.append('}'); return;
    }
    if (value instanceof Collection<?> collection) {
      out.append('['); boolean first = true;
      for (Object item : collection) { if (!first) out.append(','); first = false; write(item, out); }
      out.append(']'); return;
    }
    if (value.getClass().isArray()) {
      out.append('['); int length = Array.getLength(value);
      for (int i=0;i<length;i++) { if (i>0) out.append(','); write(Array.get(value,i), out); }
      out.append(']'); return;
    }
    if (value.getClass().isRecord()) {
      Map<String,Object> record = new LinkedHashMap<>();
      try {
        for (RecordComponent component : value.getClass().getRecordComponents()) record.put(component.getName(), component.getAccessor().invoke(value));
      } catch (ReflectiveOperationException error) { throw new IllegalArgumentException("cannot serialize record", error); }
      write(record, out); return;
    }
    throw new IllegalArgumentException("unsupported JSON value: " + value.getClass().getName());
  }

  private static void writeString(String value, StringBuilder out) {
    out.append('"');
    for (int i=0;i<value.length();i++) {
      char ch = value.charAt(i);
      switch (ch) {
        case '"' -> out.append("\\\""); case '\\' -> out.append("\\\\"); case '\b' -> out.append("\\b"); case '\f' -> out.append("\\f");
        case '\n' -> out.append("\\n"); case '\r' -> out.append("\\r"); case '\t' -> out.append("\\t");
        default -> { if (ch < 0x20) out.append(String.format("\\u%04x", (int) ch)); else out.append(ch); }
      }
    }
    out.append('"');
  }

  static Object parse(String input) { return new Parser(input).parse(); }
  @SuppressWarnings("unchecked") static Map<String,Object> object(Object value) { if (!(value instanceof Map<?,?> map)) throw new IllegalArgumentException("JSON object required"); return (Map<String,Object>) map; }

  private static final class Parser {
    private final String text; private int index; Parser(String text) { this.text = text; }
    Object parse() { skip(); Object value = value(); skip(); if (index != text.length()) fail("trailing data"); return value; }
    private Object value() { skip(); if (index>=text.length()) fail("unexpected end"); char ch=text.charAt(index); return switch(ch) { case '{' -> object(); case '[' -> array(); case '"' -> string(); case 't' -> literal("true", Boolean.TRUE); case 'f' -> literal("false", Boolean.FALSE); case 'n' -> literal("null", null); default -> number(); }; }
    private Map<String,Object> object() { index++; LinkedHashMap<String,Object> map=new LinkedHashMap<>(); skip(); if (take('}')) return map; while(true){ skip(); if(index>=text.length()||text.charAt(index)!='"') fail("object key required"); String key=string(); skip(); require(':'); map.put(key,value()); skip(); if(take('}')) return map; require(','); } }
    private List<Object> array() { index++; ArrayList<Object> list=new ArrayList<>(); skip(); if(take(']')) return list; while(true){ list.add(value()); skip(); if(take(']')) return list; require(','); } }
    private String string() { require('"'); StringBuilder out=new StringBuilder(); while(index<text.length()){ char ch=text.charAt(index++); if(ch=='"') return out.toString(); if(ch!='\\'){out.append(ch);continue;} if(index>=text.length()) fail("bad escape"); char esc=text.charAt(index++); switch(esc){case '"','\\','/' -> out.append(esc); case 'b'->out.append('\b'); case 'f'->out.append('\f'); case 'n'->out.append('\n'); case 'r'->out.append('\r'); case 't'->out.append('\t'); case 'u'->{if(index+4>text.length())fail("bad unicode");out.append((char)Integer.parseInt(text.substring(index,index+4),16));index+=4;} default->fail("bad escape");}} fail("unterminated string"); return null; }
    private Object literal(String token,Object value){if(!text.startsWith(token,index))fail("invalid literal");index+=token.length();return value;}
    private Number number(){int start=index;if(take('-')){}while(index<text.length()&&Character.isDigit(text.charAt(index)))index++;boolean decimal=false;if(take('.')){decimal=true;while(index<text.length()&&Character.isDigit(text.charAt(index)))index++;}if(index<text.length()&&(text.charAt(index)=='e'||text.charAt(index)=='E')){decimal=true;index++;if(index<text.length()&&(text.charAt(index)=='+'||text.charAt(index)=='-'))index++;while(index<text.length()&&Character.isDigit(text.charAt(index)))index++;}String raw=text.substring(start,index);try{return decimal?Double.valueOf(raw):Long.valueOf(raw);}catch(NumberFormatException e){fail("invalid number");return 0;}}
    private void skip(){while(index<text.length()&&Character.isWhitespace(text.charAt(index)))index++;} private boolean take(char expected){if(index<text.length()&&text.charAt(index)==expected){index++;return true;}return false;} private void require(char expected){if(!take(expected))fail("expected "+expected);} private void fail(String message){throw new IllegalArgumentException("invalid JSON at "+index+": "+message);}
  }
}
