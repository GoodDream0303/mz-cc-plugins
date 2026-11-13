/* Private, read-only Windows process observer. No WMI or managed runtime. */
#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0602
#endif
#include <windows.h>
#include <tlhelp32.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <io.h>

#define MAX_SCOPE 8
#define MAX_LINE 4096
typedef struct { DWORD pid; uint64_t birth; HANDLE handle; } Scope;
typedef struct { DWORD pid,parent; FILETIME birth; char name[1024]; int present; } Fact;
static Scope scope[MAX_SCOPE];
static int scope_count;
static HANDLE stopping;
static CRITICAL_SECTION output_lock;
static volatile LONG failed;

static uint64_t ticks(FILETIME f) { return ((uint64_t)f.dwHighDateTime<<32)|f.dwLowDateTime; }
static int number(const char *s,uint64_t *value) {
 uint64_t n=0;
 if(!s||!*s)return 0;
 for(;*s;s++){ unsigned d=(unsigned)(*s-'0');if(d>9||n>(UINT64_MAX-d)/10)return 0;n=n*10+d; }
 *value=n;return 1;
}
static int allowed(DWORD pid) { for(int i=0;i<scope_count;i++)if(scope[i].pid==pid)return 1;return 0; }
static void error_event(const char *code,unsigned id) {
 EnterCriticalSection(&output_lock);
 printf("{\"type\":\"error\",\"code\":\"%s\",\"id\":%u}\n",code,id);
 LeaveCriticalSection(&output_lock);
}
static void exit_event(DWORD pid) {
 EnterCriticalSection(&output_lock);printf("{\"type\":\"exited\",\"pid\":%lu}\n",(unsigned long)pid);LeaveCriticalSection(&output_lock);
}

/* Complete enumeration is required even when requested entries were found. */
static int snapshot(Fact *facts,int count,DWORD *own_parent) {
 FILETIME collected;GetSystemTimePreciseAsFileTime(&collected);
 HANDLE list=CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0);
 if(list==INVALID_HANDLE_VALUE)return 0;
 PROCESSENTRY32W entry;memset(&entry,0,sizeof(entry));entry.dwSize=sizeof(entry);
 if(!Process32FirstW(list,&entry)){CloseHandle(list);return 0;}
 int valid=1;
 do {
  if(own_parent&&entry.th32ProcessID==GetCurrentProcessId())*own_parent=entry.th32ParentProcessID;
  for(int i=0;i<count;i++)if(facts[i].pid==entry.th32ProcessID){
   if(facts[i].present){valid=0;break;}
   facts[i].present=1;facts[i].parent=entry.th32ParentProcessID;
   if(!WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,entry.szExeFile,-1,facts[i].name,sizeof(facts[i].name),NULL,NULL))valid=0;
  }
 }while(Process32NextW(list,&entry));
 if(GetLastError()!=ERROR_NO_MORE_FILES)valid=0;
 CloseHandle(list);
 if(!valid)return 0;
 for(int i=0;i<count;i++)if(facts[i].present){
  HANDLE h=OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,FALSE,facts[i].pid);
  if(!h)return 0;
  FILETIME ended,kernel,user;
  int ok=GetProcessTimes(h,&facts[i].birth,&ended,&kernel,&user);
  CloseHandle(h);
  /* A PID created during/after enumeration cannot borrow an old parent/name. */
  if(!ok||ticks(facts[i].birth)>ticks(collected))return 0;
 }
 return 1;
}
static void json_name(const char *value) {
 putchar('"');
 for(const unsigned char *s=(const unsigned char*)value;*s;s++){
  if(*s=='"'||*s=='\\'){putchar('\\');putchar(*s);}
  else if(*s<32)printf("\\u%04x",(unsigned)*s);
  else putchar(*s);
 }
 putchar('"');
}
static int facts_event(unsigned id,Fact *facts,int count) {
 SYSTEMTIME dates[MAX_SCOPE];
 for(int i=0;i<count;i++)if(facts[i].present&&!FileTimeToSystemTime(&facts[i].birth,&dates[i]))return 0;
 EnterCriticalSection(&output_lock);
 printf("{\"type\":\"facts\",\"id\":%u,\"values\":[",id);int emitted=0;
 for(int i=0;i<count;i++)if(facts[i].present){
  SYSTEMTIME d=dates[i];if(emitted++)putchar(',');
  printf("{\"pid\":%lu,\"parentPid\":%lu,\"name\":",(unsigned long)facts[i].pid,(unsigned long)facts[i].parent);json_name(facts[i].name);
  printf(",\"startedAt\":\"%04u-%02u-%02uT%02u:%02u:%02u.%06llu0Z\"}",d.wYear,d.wMonth,d.wDay,d.wHour,d.wMinute,d.wSecond,(unsigned long long)((ticks(facts[i].birth)/10)%1000000));
 }
 puts("]}");int ok=!ferror(stdout);LeaveCriticalSection(&output_lock);return ok;
}
static DWORD WINAPI commands(void *unused) {
 (void)unused;char line[MAX_LINE];
 while(fgets(line,sizeof(line),stdin)){
  if(!strchr(line,'\n')&&!feof(stdin)){error_event("PROTOCOL",0);InterlockedExchange(&failed,1);break;}
  char *context=NULL,*word=strtok_s(line," \t\r\n",&context);
  if(word&&!strcmp(word,"Q")&&!strtok_s(NULL," \t\r\n",&context))break;
  uint64_t request;if(!word||strcmp(word,"F")||!number(strtok_s(NULL," \t\r\n",&context),&request)||request==0||request>2147483647){error_event("PROTOCOL",0);InterlockedExchange(&failed,1);break;}
  Fact facts[MAX_SCOPE];memset(facts,0,sizeof(facts));int count=0,valid=1;
  while((word=strtok_s(NULL," \t\r\n",&context))){
   uint64_t pid;if(count==MAX_SCOPE||!number(word,&pid)||!pid||pid>MAXDWORD||!allowed((DWORD)pid)){valid=0;break;}
   for(int i=0;i<count;i++)if(facts[i].pid==(DWORD)pid)valid=0;
   if(!valid)break;facts[count++].pid=(DWORD)pid;
  }
  if(!valid||!count){error_event("SCOPE",(unsigned)request);continue;}
  if(!snapshot(facts,count,NULL)||!facts_event((unsigned)request,facts,count))error_event("SNAPSHOT",(unsigned)request);
  if(ferror(stdout))break;
 }
 SetEvent(stopping);return 0;
}

int main(int argc,char **argv) {
 _setmode(_fileno(stdin),_O_BINARY);_setmode(_fileno(stdout),_O_BINARY);setvbuf(stdout,NULL,_IONBF,0);
 InitializeCriticalSection(&output_lock);
 uint64_t parent;
 if(argc<5||strcmp(argv[1],"--parent")||!number(argv[2],&parent)||!parent||parent>MAXDWORD||strcmp(argv[3],"--scope")){error_event("ARGUMENTS",0);return 2;}
 for(int i=4;i<argc;i++){
  if(scope_count==MAX_SCOPE){error_event("SCOPE",0);return 2;}
  char *separator=strchr(argv[i],':');uint64_t pid,birth;
  if(!separator){error_event("ARGUMENTS",0);return 2;}*separator=0;
  if(!number(argv[i],&pid)||!pid||pid>MAXDWORD||!number(separator+1,&birth)||allowed((DWORD)pid)){error_event("ARGUMENTS",0);return 2;}
  scope[scope_count].pid=(DWORD)pid;scope[scope_count++].birth=birth;
 }
 if(!allowed((DWORD)parent)){error_event("PARENT",0);return 2;}
 Fact initial[MAX_SCOPE];memset(initial,0,sizeof(initial));for(int i=0;i<scope_count;i++)initial[i].pid=scope[i].pid;
 DWORD own_parent=0;
 if(!snapshot(initial,scope_count,&own_parent)||own_parent!=(DWORD)parent){error_event("IDENTITY",0);return 2;}
 for(int i=0;i<scope_count;i++){
  if(!initial[i].present||ticks(initial[i].birth)/10!=scope[i].birth){exit_event(scope[i].pid);return 0;}
  HANDLE h=OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION|SYNCHRONIZE,FALSE,scope[i].pid);
  if(!h){error_event("IDENTITY",0);return 2;}scope[i].handle=h;
  FILETIME birth,ended,kernel,user;
  if(!GetProcessTimes(h,&birth,&ended,&kernel,&user)){error_event("IDENTITY",0);return 2;}
  if(ticks(birth)/10!=scope[i].birth){exit_event(scope[i].pid);return 0;}
 }
 stopping=CreateEventW(NULL,TRUE,FALSE,NULL);if(!stopping){error_event("WAIT",0);return 2;}
 HANDLE reader=CreateThread(NULL,0,commands,NULL,0,NULL);if(!reader){error_event("PIPE",0);return 2;}
 puts("{\"type\":\"ready\"}");
 HANDLE handles[MAX_SCOPE+1];handles[0]=stopping;for(int i=0;i<scope_count;i++)handles[i+1]=scope[i].handle;
 DWORD result=WaitForMultipleObjects((DWORD)scope_count+1,handles,FALSE,INFINITE);
 if(result>WAIT_OBJECT_0&&result<=WAIT_OBJECT_0+(DWORD)scope_count)exit_event(scope[result-WAIT_OBJECT_0-1].pid);
 else if(result!=WAIT_OBJECT_0){error_event("WAIT",0);InterlockedExchange(&failed,1);}
 SetEvent(stopping);CancelSynchronousIo(reader);
 /* ExitProcess releases resources if a request cannot finish during shutdown. */
 if(WaitForSingleObject(reader,1000)!=WAIT_OBJECT_0)ExitProcess(failed?2:0);
 CloseHandle(reader);CloseHandle(stopping);
 for(int i=0;i<scope_count;i++)CloseHandle(scope[i].handle);
 DeleteCriticalSection(&output_lock);return failed?2:0;
}
